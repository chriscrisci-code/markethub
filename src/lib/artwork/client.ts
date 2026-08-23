"use client";

import { normalizePrintableAreas } from "@/lib/domain/artwork-sides";
import { createClient } from "@/lib/supabase/client";
import type { ArtworkSide } from "@/lib/types/database";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

type ArtworkRow = { id: string; storage_path: string; side?: string | null };

async function findArtworkForSide(
  itemId: string,
  side: ArtworkSide
): Promise<{ row: ArtworkRow | null; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("item_artwork")
    .select("id, storage_path, side")
    .eq("item_id", itemId)
    .eq("side", side)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  if (data) {
    return { row: data };
  }

  const { data: rows, error: listError } = await supabase
    .from("item_artwork")
    .select("id, storage_path, side")
    .eq("item_id", itemId);

  if (listError) {
    return { row: null, error: listError.message };
  }

  const needle = `/${side}-`;
  const match = (rows ?? []).find((row) => row.storage_path.includes(needle));
  return { row: match ?? null };
}

/** Upload/replace artwork for one side via the browser Supabase client. */
export async function uploadArtworkClient(
  itemId: string,
  file: File,
  side: ArtworkSide = "front"
): Promise<{ success?: true; error?: string }> {
  if (!file || file.size === 0) {
    return { error: "Please choose an image file." };
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return {
      error:
        "Artwork must be PNG or JPG (Printful does not accept WebP/HEIC/SVG).",
    };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "You must be signed in to upload artwork." };
  }

  const extension = file.name.split(".").pop() ?? "png";
  const storagePath = `${user.id}/${itemId}/${side}-${Date.now()}.${extension}`;

  // Remove previous file for this side (best-effort) before writing the new one.
  const existing = await findArtworkForSide(itemId, side);
  if (existing.row?.storage_path) {
    await supabase.storage.from("artwork").remove([existing.row.storage_path]);
  }

  const { error: uploadError } = await supabase.storage
    .from("artwork")
    .upload(storagePath, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { error: upsertError } = await supabase.from("item_artwork").upsert(
    {
      item_id: itemId,
      side,
      storage_path: storagePath,
      original_filename: file.name,
    },
    { onConflict: "item_id,side" }
  );

  if (upsertError) {
    await supabase.storage.from("artwork").remove([storagePath]);
    return { error: upsertError.message };
  }

  return { success: true };
}

/** Clear artwork for one side and remove that side's saved placement. */
export async function clearArtworkClient(
  itemId: string,
  side: ArtworkSide = "front"
): Promise<{ success?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "You must be signed in to clear artwork." };
  }

  const { row: artwork, error: fetchError } = await findArtworkForSide(
    itemId,
    side
  );

  if (fetchError) {
    return { error: fetchError };
  }

  if (artwork) {
    const { error: deleteError } = await supabase
      .from("item_artwork")
      .delete()
      .eq("id", artwork.id);

    if (deleteError) {
      return { error: deleteError.message };
    }

    if (artwork.storage_path) {
      await supabase.storage.from("artwork").remove([artwork.storage_path]);
    }
  }

  const { data: design } = await supabase
    .from("item_designs")
    .select("printable_areas")
    .eq("item_id", itemId)
    .maybeSingle();

  if (design) {
    const areas = { ...normalizePrintableAreas(design.printable_areas) };
    delete areas[side];
    await supabase
      .from("item_designs")
      .update({ printable_areas: areas })
      .eq("item_id", itemId);
  }

  return { success: true };
}
