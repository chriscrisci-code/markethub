import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; mockupId: string }> }
) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: itemId, mockupId } = await params;

  const { data: item } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const { data: mockup, error: fetchError } = await supabase
    .from("item_mockups")
    .select("id, storage_path, variant_id")
    .eq("id", mockupId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!mockup) {
    return NextResponse.json({ error: "Mockup not found." }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("item_mockups")
    .delete()
    .eq("id", mockupId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (mockup.storage_path) {
    await supabase.storage.from("mockups").remove([mockup.storage_path]);
  }

  const variantId = mockup.variant_id as string | null;
  if (variantId) {
    const { count } = await supabase
      .from("item_mockups")
      .select("id", { count: "exact", head: true })
      .eq("variant_id", variantId);

    if ((count ?? 0) === 0) {
      await supabase.from("item_variants").delete().eq("id", variantId);
    }
  }

  return NextResponse.json({ success: true });
}
