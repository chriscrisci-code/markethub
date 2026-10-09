import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getMarketplaceConnector } from "@/lib/connectors/marketplace/registry";
import { primaryArtwork } from "@/lib/domain/artwork-sides";
import type { ItemArtwork } from "@/lib/types/database";
import type { MasterItem } from "@/lib/connectors/marketplace/types";

type ListingAction = "publish" | "update" | "unpublish";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: itemId } = await params;

  let body: { connectionId?: string; action?: ListingAction };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const connectionId = body.connectionId ?? "";
  const action = body.action;
  if (!connectionId || !action) {
    return NextResponse.json(
      { error: "connectionId and action are required." },
      { status: 400 }
    );
  }

  const { data: item } = await supabase
    .from("items")
    .select("*, item_artwork (*)")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const { data: connection } = await supabase
    .from("connector_connections")
    .select("id, connector_key, display_name")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "Storefront not found." }, { status: 404 });
  }

  const connector = getMarketplaceConnector(connection.connector_key);
  if (!connector) {
    return NextResponse.json(
      { error: "Sales channel connector not found." },
      { status: 400 }
    );
  }

  const { data: listing } = await supabase
    .from("channel_listings")
    .select("*")
    .eq("item_id", itemId)
    .eq("connection_id", connectionId)
    .maybeSingle();

  const masterItem: MasterItem = {
    ...(item as MasterItem),
    artwork: primaryArtwork(item.item_artwork as ItemArtwork[]),
  };

  try {
    if (
      connection.connector_key === "etsy" &&
      (action === "publish" || action === "update")
    ) {
      const { publishEtsyDraft } = await import("@/lib/etsy/publish-draft");
      const result = await publishEtsyDraft({
        supabase,
        userId: user.id,
        itemId,
        connectionId,
      });
      return NextResponse.json(result.body, { status: result.status });
    }

    if (action === "publish" || action === "update") {
      const result =
        action === "publish"
          ? await connector.publishListing(masterItem)
          : await connector.updateListing(
              listing?.external_listing_id ?? itemId,
              masterItem
            );

      const { error } = await supabase.from("channel_listings").upsert(
        {
          item_id: itemId,
          connector_key: connection.connector_key,
          connection_id: connectionId,
          external_listing_id: result.externalListingId,
          sync_status: result.syncStatus,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "item_id,connection_id" }
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: result.syncStatus });
    }

    await connector.unpublishListing(listing?.external_listing_id ?? itemId);

    if (listing) {
      const { error } = await supabase
        .from("channel_listings")
        .update({
          sync_status: "not_published",
          external_listing_id: null,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", listing.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (listing) {
      await supabase
        .from("channel_listings")
        .update({
          sync_status: "sync_error",
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", listing.id);
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Channel action failed.",
      },
      { status: 500 }
    );
  }
}
