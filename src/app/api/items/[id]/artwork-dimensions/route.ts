import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import type { ArtworkSide } from "@/lib/types/database";

type ArtworkDimensionsBody = {
  side: ArtworkSide;
  widthPx: number;
  heightPx: number;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json({ error: authError ?? "Unauthorized" }, { status: 401 });
  }

  const { id: itemId } = await params;

  let body: ArtworkDimensionsBody;
  try {
    body = (await request.json()) as ArtworkDimensionsBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.side !== "front" && body.side !== "back") {
    return NextResponse.json({ error: "Invalid artwork side." }, { status: 400 });
  }

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

  const { error } = await supabase
    .from("item_artwork")
    .update({ width_px: body.widthPx, height_px: body.heightPx })
    .eq("item_id", itemId)
    .eq("side", body.side);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
