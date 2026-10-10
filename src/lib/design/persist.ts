import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrintableAreasMap, ProviderProductRef } from "@/lib/types/database";

type PersistInput = {
  providerProductRef: ProviderProductRef | null | undefined;
  printableAreas: PrintableAreasMap | null | undefined;
};

export type PersistedDesign = {
  designId: string;
  itemId: string;
  productId: string;
};

type DesignWrite = {
  item_id: string;
  provider_product_ref: ProviderProductRef;
  printable_areas: PrintableAreasMap;
};

type DesignRow = {
  id: string;
  item_id: string;
  provider_product_ref: unknown;
};

function productRefFrom(
  input: PersistInput
): { ref: ProviderProductRef; areas: PrintableAreasMap } | { error: string; status: 400 } {
  const raw = input.providerProductRef;
  const id = raw?.id != null ? String(raw.id).trim() : "";
  if (!id) {
    return {
      error: "Choose a product before saving the design.",
      status: 400,
    };
  }

  const areas = input.printableAreas ?? {};
  const front = areas.front;
  if (!front?.areaId) {
    return {
      error: "Place the artwork on the front before saving the design.",
      status: 400,
    };
  }

  return {
    areas,
    ref: {
      id,
      name: String(raw?.name ?? ""),
      category: String(raw?.category ?? ""),
      baseCostCents: Number(raw?.baseCostCents) || 0,
      areaId: String(raw?.areaId ?? front.areaId),
    },
  };
}

function storedProductId(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const id = (value as { id?: unknown }).id;
  return id != null ? String(id).trim() : "";
}

function confirmed(
  data: DesignRow | null,
  itemId: string,
  productId: string
): PersistedDesign | { error: string } {
  if (!data) {
    return {
      error:
        "Design was not saved. No item_designs record was created for this item.",
    };
  }
  if (data.item_id !== itemId) {
    return { error: "Design was saved for a different item." };
  }
  const storedId = storedProductId(data.provider_product_ref);
  if (storedId !== productId) {
    return { error: "Design was saved without the Printful product id." };
  }
  return { designId: data.id, itemId: data.item_id, productId: storedId };
}

async function readDesign(supabase: SupabaseClient, itemId: string) {
  return supabase
    .from("item_designs")
    .select("id, item_id, provider_product_ref")
    .eq("item_id", itemId)
    .maybeSingle();
}

async function writeDesign(
  supabase: SupabaseClient,
  itemId: string,
  row: DesignWrite,
  existingId: string | null
) {
  if (existingId) {
    return supabase
      .from("item_designs")
      .update(row)
      .eq("id", existingId)
      .eq("item_id", itemId)
      .select("id, item_id, provider_product_ref")
      .maybeSingle();
  }

  return supabase
    .from("item_designs")
    .insert(row)
    .select("id, item_id, provider_product_ref")
    .maybeSingle();
}

/**
 * Insert or update the single design row for an item.
 * Success is returned only after the row is read back with the product id.
 */
export async function persistItemDesign(
  supabase: SupabaseClient,
  itemId: string,
  input: PersistInput
): Promise<PersistedDesign | { error: string; status?: number }> {
  const parsed = productRefFrom(input);
  if ("error" in parsed) return parsed;

  const row: DesignWrite = {
    item_id: itemId,
    provider_product_ref: parsed.ref,
    printable_areas: parsed.areas,
  };

  const existing = await readDesign(supabase, itemId);
  if (existing.error) return { error: existing.error.message };

  let written = await writeDesign(
    supabase,
    itemId,
    row,
    existing.data?.id ?? null
  );

  if (written.error?.code === "23505") {
    const raced = await readDesign(supabase, itemId);
    if (raced.error) return { error: raced.error.message };
    if (!raced.data) return { error: written.error.message };
    written = await writeDesign(supabase, itemId, row, raced.data.id);
  }

  if (written.error) return { error: written.error.message };

  let data = written.data as DesignRow | null;
  if (!data) {
    const again = await readDesign(supabase, itemId);
    if (again.error) return { error: again.error.message };
    data = again.data as DesignRow | null;
  }

  return confirmed(data, itemId, parsed.ref.id);
}
