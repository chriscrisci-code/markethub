import type { SupabaseClient } from "@supabase/supabase-js";
import { listPrintfulCatalogVariants } from "@/lib/connectors/fulfillment/printful";
import {
  purchasableCatalogVariants,
  stableSku,
} from "@/lib/variants/combinations";

type SyncResult = {
  mapped: number;
  catalogVariantIds: string[];
  error?: string;
};

/** Store Printful catalog variant ids for one color and link them to the mockup. */
export async function syncPrintfulColorVariants(
  supabase: SupabaseClient,
  input: {
    itemId: string;
    mockupId: string;
    colorName: string;
    catalogProductId: string;
    designId?: string | null;
  }
): Promise<SyncResult> {
  let catalog;
  try {
    catalog = await listPrintfulCatalogVariants(input.catalogProductId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Printful catalog lookup failed.";
    await supabase
      .from("item_mockups")
      .update({ mapping_status: "needs_resolution" })
      .eq("id", input.mockupId);
    return { mapped: 0, catalogVariantIds: [], error: message };
  }

  const matches = purchasableCatalogVariants(
    catalog.map((variant) => ({
      catalogVariantId: variant.catalogVariantId,
      colorName: variant.colorName,
      sizeName: variant.sizeName,
      inStock: variant.inStock,
    })),
    input.colorName
  );

  if (matches.length === 0) {
    await supabase
      .from("item_mockups")
      .update({
        mapping_status: "needs_resolution",
        catalog_product_id: input.catalogProductId,
        item_design_id: input.designId ?? null,
      })
      .eq("id", input.mockupId);
    return {
      mapped: 0,
      catalogVariantIds: [],
      error: `Printful has no in-stock sizes for ${input.colorName}.`,
    };
  }

  const full = catalog.filter((variant) =>
    matches.some((match) => match.catalogVariantId === variant.catalogVariantId)
  );

  const localIds: string[] = [];
  for (const variant of full) {
    const { data: saved, error } = await supabase
      .from("provider_catalog_variants")
      .upsert(
        {
          item_id: input.itemId,
          provider_key: "printful",
          catalog_product_id: variant.catalogProductId,
          catalog_variant_id: variant.catalogVariantId,
          color_name: variant.colorName,
          color_code: variant.colorCode,
          size_name: variant.sizeName,
          sku: stableSku(input.itemId, variant.catalogVariantId),
          in_stock: variant.inStock,
          cost_cents: variant.costCents,
          currency: variant.currency,
        },
        { onConflict: "item_id,provider_key,catalog_variant_id" }
      )
      .select("id")
      .single();

    if (error || !saved) {
      await supabase
        .from("item_mockups")
        .update({ mapping_status: "needs_resolution" })
        .eq("id", input.mockupId);
      return {
        mapped: localIds.length,
        catalogVariantIds: [],
        error: error?.message ?? "Could not store a Printful variant.",
      };
    }
    localIds.push(saved.id as string);

    const sku = stableSku(input.itemId, variant.catalogVariantId);
    const { data: existing } = await supabase
      .from("item_variants")
      .select("id")
      .eq("item_id", input.itemId)
      .eq("sku", sku)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("item_variants")
        .update({
          label: `${variant.colorName} / ${variant.sizeName}`,
          provider_catalog_variant_id: saved.id,
          attributes: {
            color: variant.colorName,
            size: variant.sizeName,
            fulfillment_provider_key: "printful",
          },
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("item_variants").insert({
        item_id: input.itemId,
        label: `${variant.colorName} / ${variant.sizeName}`,
        sku,
        provider_catalog_variant_id: saved.id,
        attributes: {
          color: variant.colorName,
          size: variant.sizeName,
          fulfillment_provider_key: "printful",
        },
      });
    }
  }

  if (localIds.length > 0) {
    await supabase.from("item_mockup_variants").upsert(
      localIds.map((id) => ({
        mockup_id: input.mockupId,
        provider_catalog_variant_id: id,
      }))
    );
  }

  await supabase
    .from("item_mockups")
    .update({
      mapping_status: "mapped",
      catalog_product_id: input.catalogProductId,
      item_design_id: input.designId ?? null,
    })
    .eq("id", input.mockupId);

  return { mapped: full.length, catalogVariantIds: full.map((v) => v.catalogVariantId) };
}
