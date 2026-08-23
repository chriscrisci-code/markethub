"use client";

import { createClient } from "@/lib/supabase/client";
import type { PrintableAreasMap, ProviderProductRef } from "@/lib/types/database";

async function requireAuthUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase,
      user: null,
      error: "You must be signed in to save design changes.",
    };
  }

  return { supabase, user, error: null };
}

/** Persist product ref and printable areas via the browser Supabase client. */
export async function saveItemDesignClient(
  itemId: string,
  payload: {
    providerProductRef: ProviderProductRef;
    printableAreas: PrintableAreasMap;
  }
): Promise<{ success?: true; error?: string }> {
  const { supabase, error: authError } = await requireAuthUser();
  if (authError) {
    return { error: authError };
  }

  const { error } = await supabase.from("item_designs").upsert(
    {
      item_id: itemId,
      provider_product_ref: payload.providerProductRef,
      printable_areas: payload.printableAreas,
    },
    { onConflict: "item_id" }
  );

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

/** Replace color/size variant rows for an item via the browser Supabase client. */
export async function saveItemVariantsClient(
  itemId: string,
  variants: Array<{ color: string; size: string }>
): Promise<{ success?: true; error?: string }> {
  const { supabase, error: authError } = await requireAuthUser();
  if (authError) {
    return { error: authError };
  }

  const { error: deleteError } = await supabase
    .from("item_variants")
    .delete()
    .eq("item_id", itemId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  if (variants.length === 0) {
    return { success: true };
  }

  const { error: insertError } = await supabase.from("item_variants").insert(
    variants.map((variant) => ({
      item_id: itemId,
      label: `${variant.color} / ${variant.size}`,
      attributes: { color: variant.color, size: variant.size },
    }))
  );

  if (insertError) {
    return { error: insertError.message };
  }

  return { success: true };
}
