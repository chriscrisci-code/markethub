"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getFulfillmentConnector } from "@/lib/connectors/fulfillment/registry";
import type {
  DesignPlacement,
  PrintableAreaState,
  ProviderProductRef,
} from "@/lib/types/database";

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

export async function saveItemDesign(
  itemId: string,
  payload: {
    providerProductRef: ProviderProductRef;
    printableArea: PrintableAreaState;
  }
) {
  const { supabase } = await requireUser();

  const { error } = await supabase.from("item_designs").upsert(
    {
      item_id: itemId,
      provider_product_ref: payload.providerProductRef,
      printable_area: payload.printableArea,
    },
    { onConflict: "item_id" }
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/items");
  return { success: true };
}

export async function saveItemVariants(
  itemId: string,
  variants: Array<{ color: string; size: string }>
) {
  const { supabase } = await requireUser();

  await supabase.from("item_variants").delete().eq("item_id", itemId);

  if (variants.length > 0) {
    const { error } = await supabase.from("item_variants").insert(
      variants.map((variant) => ({
        item_id: itemId,
        label: `${variant.color} / ${variant.size}`,
        attributes: { color: variant.color, size: variant.size },
      }))
    );

    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath(`/items/${itemId}`);
  return { success: true };
}

export async function validateItemDesign(itemId: string) {
  const { supabase } = await requireUser();

  const { data: item, error } = await supabase
    .from("items")
    .select(
      `
      *,
      item_artwork (*),
      item_designs (*)
    `
    )
    .eq("id", itemId)
    .maybeSingle();

  if (error || !item) {
    return { error: error?.message ?? "Item not found." };
  }

  const design = Array.isArray(item.item_designs)
    ? item.item_designs[0]
    : item.item_designs;
  const artwork = Array.isArray(item.item_artwork)
    ? item.item_artwork[0]
    : item.item_artwork;

  if (!design || !artwork) {
    return { error: "Upload artwork and choose a product first." };
  }

  const providerKey = item.fulfillment_provider_key ?? "mock-fulfillment";
  const connector = getFulfillmentConnector(providerKey);

  if (!connector) {
    return { error: "Fulfillment provider connector not found." };
  }

  const printableArea = design.printable_area as PrintableAreaState;
  const productRef = design.provider_product_ref as ProviderProductRef;

  const widthPx = artwork.width_px ?? 2000;
  const heightPx = artwork.height_px ?? 2000;

  const masterDesign = {
    artworkUrl: artwork.storage_path,
    widthPx,
    heightPx,
    placement: printableArea.placement,
  };

  // Convert stored scale (fraction of print area width) into absolute pixel scale
  // for connector validation that compares artwork*scale to area pixels.
  const absoluteScale =
    (printableArea.placement.scale * printableArea.widthPx) / widthPx;

  const validation = await connector.validateDesign(
    {
      ...masterDesign,
      placement: {
        ...printableArea.placement,
        scale: absoluteScale,
      },
    },
    { id: productRef.id }
  );

  if (validation.valid) {
    return { valid: true as const, issues: [] };
  }

  return {
    valid: false as const,
    issues: validation.issues,
    canAutoFix: true,
  };
}

export async function proposeDesignAutoFix(itemId: string) {
  const { supabase } = await requireUser();

  const { data: item, error } = await supabase
    .from("items")
    .select(
      `
      *,
      item_artwork (*),
      item_designs (*)
    `
    )
    .eq("id", itemId)
    .maybeSingle();

  if (error || !item) {
    return { error: error?.message ?? "Item not found." };
  }

  const design = Array.isArray(item.item_designs)
    ? item.item_designs[0]
    : item.item_designs;
  const artwork = Array.isArray(item.item_artwork)
    ? item.item_artwork[0]
    : item.item_artwork;

  if (!design || !artwork) {
    return { error: "Upload artwork and choose a product first." };
  }

  const providerKey = item.fulfillment_provider_key ?? "mock-fulfillment";
  const connector = getFulfillmentConnector(providerKey);

  if (!connector) {
    return { error: "Fulfillment provider connector not found." };
  }

  const printableArea = design.printable_area as PrintableAreaState;
  const widthPx = artwork.width_px ?? 2000;
  const heightPx = artwork.height_px ?? 2000;
  const absoluteScale =
    (printableArea.placement.scale * printableArea.widthPx) / widthPx;

  const issue = {
    code: "ARTWORK_EXCEEDS_PRINT_AREA",
    message: "Artwork exceeds this provider's printable area.",
  };

  const proposal = await connector.proposeFix(
    {
      artworkUrl: artwork.storage_path,
      widthPx,
      heightPx,
      placement: {
        ...printableArea.placement,
        scale: absoluteScale,
      },
    },
    issue
  );

  // Convert proposed absolute scale back to area-relative scale for storage
  const relativeScale =
    (proposal.adjustment.scale * widthPx) / printableArea.widthPx;

  const adjustment: DesignPlacement = {
    x: proposal.adjustment.x,
    y: proposal.adjustment.y,
    scale: Math.min(relativeScale, 0.95),
    rotation: proposal.adjustment.rotation,
  };

  const { data: saved, error: saveError } = await supabase
    .from("provider_design_adjustments")
    .insert({
      item_design_id: design.id,
      provider_key: providerKey,
      adjustment,
      status: "proposed",
    })
    .select("*")
    .single();

  if (saveError) {
    return { error: saveError.message };
  }

  revalidatePath(`/items/${itemId}`);
  return {
    success: true,
    adjustment: saved,
    description: proposal.description,
  };
}

export async function approveDesignAdjustment(
  itemId: string,
  adjustmentId: string
) {
  const { supabase } = await requireUser();

  const { data: adjustment, error } = await supabase
    .from("provider_design_adjustments")
    .select("*")
    .eq("id", adjustmentId)
    .maybeSingle();

  if (error || !adjustment) {
    return { error: error?.message ?? "Adjustment not found." };
  }

  // Apply proposed placement into a *provider-specific* record only.
  // Master printable_area stays unchanged; we mark adjustment approved
  // so channels/providers can use it later without mutating master.
  const { error: updateError } = await supabase
    .from("provider_design_adjustments")
    .update({ status: "approved" })
    .eq("id", adjustmentId);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath(`/items/${itemId}`);
  return { success: true };
}

export async function revertDesignAdjustment(
  itemId: string,
  adjustmentId: string
) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("provider_design_adjustments")
    .update({ status: "reverted" })
    .eq("id", adjustmentId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/items/${itemId}`);
  return { success: true };
}

export async function updateArtworkDimensions(
  itemId: string,
  widthPx: number,
  heightPx: number
) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("item_artwork")
    .update({ width_px: widthPx, height_px: heightPx })
    .eq("item_id", itemId);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
