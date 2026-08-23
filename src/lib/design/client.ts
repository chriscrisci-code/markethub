"use client";

import { createClient } from "@/lib/supabase/client";
import type { PrintableAreasMap, ProviderProductRef } from "@/lib/types/database";

const CLIENT_TIMEOUT_MS = 15_000;

function withTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
  ms = CLIENT_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`));
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function requireAuthUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await withTimeout(supabase.auth.getUser(), "Auth check");

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
  try {
    const { supabase, error: authError } = await requireAuthUser();
    if (authError) {
      return { error: authError };
    }

    const { error } = await withTimeout(
      supabase.from("item_designs").upsert(
        {
          item_id: itemId,
          provider_product_ref: payload.providerProductRef,
          printable_areas: payload.printableAreas,
        },
        { onConflict: "item_id" }
      ),
      "Saving design"
    );

    if (error) {
      return { error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not save design.",
    };
  }
}

/** Replace color/size variant rows for an item via the browser Supabase client. */
export async function saveItemVariantsClient(
  itemId: string,
  variants: Array<{ color: string; size: string }>
): Promise<{ success?: true; error?: string }> {
  try {
    const { supabase, error: authError } = await requireAuthUser();
    if (authError) {
      return { error: authError };
    }

    const { error: deleteError } = await withTimeout(
      supabase.from("item_variants").delete().eq("item_id", itemId),
      "Clearing variants"
    );

    if (deleteError) {
      return { error: deleteError.message };
    }

    if (variants.length === 0) {
      return { success: true };
    }

    const { error: insertError } = await withTimeout(
      supabase.from("item_variants").insert(
        variants.map((variant) => ({
          item_id: itemId,
          label: `${variant.color} / ${variant.size}`,
          attributes: { color: variant.color, size: variant.size },
        }))
      ),
      "Saving variants"
    );

    if (insertError) {
      return { error: insertError.message };
    }

    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not save variants.",
    };
  }
}
