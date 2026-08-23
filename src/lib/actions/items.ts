"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizePrintableAreas } from "@/lib/domain/artwork-sides";
import { parseDollarsToCents } from "@/lib/domain/format";
import type { ArtworkSide } from "@/lib/types/database";

type ArtworkRow = { id: string; storage_path: string; side?: string };

async function findArtworkForSide(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  side: ArtworkSide
): Promise<{ row: ArtworkRow | null; error?: string }> {
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

  // Legacy rows uploaded before side column was reliable
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

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createItem() {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      name: "Untitled Item",
      fulfillment_provider_key: "mock-fulfillment",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create item");
  }

  const marketplaceKeys = ["mock-marketplace", "market-hub-store"];
  await supabase.from("channel_listings").upsert(
    marketplaceKeys.map((connector_key) => ({
      item_id: data.id,
      connector_key,
      sync_status: "not_published" as const,
    })),
    { onConflict: "item_id,connector_key" }
  );

  revalidatePath("/items");
  redirect(`/items/${data.id}`);
}

export async function updateItem(itemId: string, formData: FormData) {
  const { supabase } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const price = String(formData.get("price") ?? "0");
  const status = String(formData.get("status") ?? "draft");
  const fulfillmentProviderKey = String(
    formData.get("fulfillment_provider_key") ?? ""
  );

  const { error } = await supabase
    .from("items")
    .update({
      name: name || "Untitled Item",
      description,
      base_price_cents: parseDollarsToCents(price),
      status,
      fulfillment_provider_key: fulfillmentProviderKey || null,
    })
    .eq("id", itemId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/items");
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function uploadArtwork(
  itemId: string,
  formData: FormData,
  side: "front" | "back" = "front"
) {
  const { supabase, user } = await requireUser();

  const file = formData.get("artwork") as File | null;
  if (!file || file.size === 0) {
    return { error: "Please choose an image file." };
  }

  const allowed = new Set(["image/png", "image/jpeg", "image/jpg"]);
  if (!allowed.has(file.type)) {
    return {
      error: "Artwork must be PNG or JPG (Printful does not accept WebP/HEIC/SVG).",
    };
  }

  const extension = file.name.split(".").pop() ?? "png";
  const storagePath = `${user.id}/${itemId}/${side}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("artwork")
    .upload(storagePath, file, { upsert: true });

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
    return { error: upsertError.message };
  }

  revalidatePath("/items");
  revalidatePath(`/items/${itemId}`);
  return { success: true };
}

/** Remove artwork for one side and clear that side's saved placement. */
export async function clearArtwork(
  itemId: string,
  side: ArtworkSide = "front"
) {
  const { supabase } = await requireUser();

  const { row: artwork, error: fetchError } = await findArtworkForSide(
    supabase,
    itemId,
    side
  );

  if (fetchError) {
    return { error: fetchError };
  }

  if (artwork) {
    const storagePath = artwork.storage_path;

    const { error: deleteError } = await supabase
      .from("item_artwork")
      .delete()
      .eq("id", artwork.id);

    if (deleteError) {
      return { error: deleteError.message };
    }

    // Best-effort cleanup — never block the response on storage or design writes.
    after(async () => {
      if (storagePath) {
        await supabase.storage.from("artwork").remove([storagePath]);
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

      revalidatePath("/items");
      revalidatePath(`/items/${itemId}`);
    });
  } else {
    revalidatePath("/items");
    revalidatePath(`/items/${itemId}`);
  }

  return { success: true };
}

