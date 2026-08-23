"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDollarsToCents } from "@/lib/domain/format";

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

