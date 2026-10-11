import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { parseDollarsToCents } from "@/lib/domain/format";

type UpdateItemBody = {
  name?: string;
  description?: string;
  price?: string;
  status?: string;
  fulfillment_provider_key?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json(
      { error: "You must be signed in to save item changes." },
      { status: 401 }
    );
  }

  const { id: itemId } = await params;

  let body: UpdateItemBody;
  try {
    body = (await request.json()) as UpdateItemBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const price = String(body.price ?? "0");
  const status = String(body.status ?? "draft");
  const fulfillmentProviderKey = String(body.fulfillment_provider_key ?? "");

  const { data, error } = await supabase
    .from("items")
    .update({
      name: name || "Untitled Item",
      description,
      base_price_cents: parseDollarsToCents(price),
      status,
      fulfillment_provider_key: fulfillmentProviderKey || null,
    })
    .eq("id", itemId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json(
      { error: "You must be signed in to delete an item." },
      { status: 401 }
    );
  }

  const { id: itemId } = await params;

  const { data: item } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const { data: listings, error: listingsError } = await supabase
    .from("channel_listings")
    .select("connector_key, connection_id, external_listing_id")
    .eq("item_id", itemId);

  if (listingsError) {
    return NextResponse.json({ error: listingsError.message }, { status: 500 });
  }

  for (const listing of listings ?? []) {
    if (listing.connector_key !== "etsy") continue;
    const listingId = listing.external_listing_id as string | null;
    if (!listingId || !/^\d+$/.test(listingId) || !listing.connection_id) continue;

    const { data: connection } = await supabase
      .from("connector_connections")
      .select("external_account_id")
      .eq("id", listing.connection_id)
      .eq("user_id", user.id)
      .maybeSingle();
    const shopId = connection?.external_account_id as string | null;
    if (!shopId) continue;

    const { etsyConfig, getValidEtsyAccessToken } = await import("@/lib/etsy/oauth");
    const { deleteEtsyListing, getListingState } = await import("@/lib/etsy/shop-listing");
    const config = etsyConfig();
    if ("error" in config) {
      return NextResponse.json({ error: "Etsy is not configured on the server." }, { status: 500 });
    }
    const token = await getValidEtsyAccessToken(listing.connection_id, user.id);
    if ("error" in token) {
      return NextResponse.json({ error: token.error }, { status: 401 });
    }

    const state = await getListingState(config, token.accessToken, shopId, listingId);
    if (state.ok && state.data.state === "active") {
      return NextResponse.json(
        {
          error:
            "This item is live on Etsy. Market Hub left it in place. Take it down in Etsy before deleting it here.",
        },
        { status: 409 }
      );
    }
    if (!state.ok && state.status !== 404) {
      return NextResponse.json({ error: state.error }, { status: 502 });
    }

    const removed = await deleteEtsyListing(config, token.accessToken, listingId);
    if (!removed.ok) {
      return NextResponse.json(
        { error: `Etsy did not delete listing ${listingId}. ${removed.error}` },
        { status: 502 }
      );
    }
  }

  const [{ data: artwork }, { data: mockups }] = await Promise.all([
    supabase.from("item_artwork").select("storage_path").eq("item_id", itemId),
    supabase.from("item_mockups").select("storage_path").eq("item_id", itemId),
  ]);

  const { error: deleteError } = await supabase.from("items").delete().eq("id", itemId).eq("user_id", user.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const artworkPaths = (artwork ?? [])
    .map((row) => row.storage_path as string | null)
    .filter((path): path is string => Boolean(path));
  const mockupPaths = (mockups ?? [])
    .map((row) => row.storage_path as string | null)
    .filter((path): path is string => Boolean(path));
  if (artworkPaths.length > 0) {
    await supabase.storage.from("artwork").remove(artworkPaths);
  }
  if (mockupPaths.length > 0) {
    await supabase.storage.from("mockups").remove(mockupPaths);
  }

  return NextResponse.json({ success: true });
}
