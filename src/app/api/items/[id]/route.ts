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
