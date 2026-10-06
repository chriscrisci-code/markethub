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
