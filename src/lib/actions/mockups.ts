"use server";

import { createClient } from "@/lib/supabase/server";
import { getFulfillmentConnector } from "@/lib/connectors/fulfillment/registry";
import type { ProviderMockupResult } from "@/lib/connectors/fulfillment/types";
import { artworkBySide } from "@/lib/domain/artwork-sides";
import type { ArtworkSide, DesignPlacement, ItemArtwork } from "@/lib/types/database";

export type MockupSideInput = {
  side: ArtworkSide;
  areaId: string;
  areaWidthPx: number;
  areaHeightPx: number;
  placement: DesignPlacement;
  /** Client-measured size; DB dimensions used when missing. */
  artworkWidthPx?: number;
  artworkHeightPx?: number;
};

export async function startProviderMockup(input: {
  providerKey: string;
  itemId: string;
  productId: string;
  color: string;
  size: string;
  sides: MockupSideInput[];
}): Promise<{ taskKey?: string; error?: string }> {
  const connector = getFulfillmentConnector(input.providerKey);
  if (!connector?.startMockupGeneration) {
    return {
      error: "This fulfillment provider does not support mockup generation yet.",
    };
  }

  if (!input.sides.length) {
    return {
      error: "Upload front and/or back artwork before generating a mockup.",
    };
  }

  const supabase = await createClient();
  const { data: artworkRows, error: artError } = await supabase
    .from("item_artwork")
    .select("*")
    .eq("item_id", input.itemId);

  if (artError) {
    return { error: artError.message };
  }

  const bySide = artworkBySide((artworkRows ?? []) as ItemArtwork[]);
  const files = [];

  for (const sideInput of input.sides) {
    const art = bySide[sideInput.side];
    if (!art?.storage_path) {
      continue;
    }

    const { data: signed, error: signError } = await supabase.storage
      .from("artwork")
      .createSignedUrl(art.storage_path, 60 * 60 * 24);

    if (signError || !signed?.signedUrl) {
      return {
        error: `Could not create a signed URL for ${sideInput.side} artwork.`,
      };
    }

    const widthPx =
      sideInput.artworkWidthPx && sideInput.artworkWidthPx > 0
        ? sideInput.artworkWidthPx
        : art.width_px && art.width_px > 0
          ? art.width_px
          : 2000;
    const heightPx =
      sideInput.artworkHeightPx && sideInput.artworkHeightPx > 0
        ? sideInput.artworkHeightPx
        : art.height_px && art.height_px > 0
          ? art.height_px
          : 2000;

    files.push({
      areaId: sideInput.areaId,
      artworkUrl: signed.signedUrl,
      areaWidthPx: sideInput.areaWidthPx,
      areaHeightPx: sideInput.areaHeightPx,
      placement: sideInput.placement,
      artworkWidthPx: widthPx,
      artworkHeightPx: heightPx,
    });
  }

  if (!files.length) {
    return {
      error:
        "No artwork found for the selected sides. Upload PNG or JPG artwork first.",
    };
  }

  try {
    const { taskKey } = await connector.startMockupGeneration({
      productId: input.productId,
      color: input.color,
      size: input.size,
      files,
    });
    return { taskKey };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to start mockup generation.",
    };
  }
}

export async function pollProviderMockup(
  providerKey: string,
  taskKey: string
): Promise<{ result?: ProviderMockupResult; error?: string }> {
  const connector = getFulfillmentConnector(providerKey);
  if (!connector?.getMockupTask) {
    return {
      error: "This fulfillment provider does not support mockup generation yet.",
    };
  }

  try {
    const result = await connector.getMockupTask(taskKey);
    return { result };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to poll mockup task.",
    };
  }
}
