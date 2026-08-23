import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import type { PrintableAreasMap, ProviderProductRef } from "@/lib/types/database";

type SaveDesignBody = {
  providerProductRef: ProviderProductRef;
  printableAreas: PrintableAreasMap;
  variants: Array<{ color: string; size: string }>;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json(
      { error: "You must be signed in to save design changes." },
      { status: 401 }
    );
  }

  const { id: itemId } = await params;

  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  let body: SaveDesignBody;
  try {
    body = (await request.json()) as SaveDesignBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { error: designError } = await supabase.from("item_designs").upsert(
    {
      item_id: itemId,
      provider_product_ref: body.providerProductRef,
      printable_areas: body.printableAreas,
    },
    { onConflict: "item_id" }
  );

  if (designError) {
    return NextResponse.json({ error: designError.message }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("item_variants")
    .delete()
    .eq("item_id", itemId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (body.variants.length > 0) {
    const { error: insertError } = await supabase.from("item_variants").insert(
      body.variants.map((variant) => ({
        item_id: itemId,
        label: `${variant.color} / ${variant.size}`,
        attributes: { color: variant.color, size: variant.size },
      }))
    );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
