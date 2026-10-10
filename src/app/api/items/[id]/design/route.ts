import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { persistItemDesign } from "@/lib/design/persist";
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

  const saved = await persistItemDesign(supabase, itemId, {
    providerProductRef: body.providerProductRef,
    printableAreas: body.printableAreas,
  });

  if ("error" in saved) {
    return NextResponse.json(
      { error: saved.error },
      { status: saved.status ?? 500 }
    );
  }

  return NextResponse.json({
    success: true,
    itemId: saved.itemId,
    designId: saved.designId,
    productId: saved.productId,
  });
}
