import type { DesignPlacement } from "@/lib/types/database";

export const DEFAULT_PLACEMENT: DesignPlacement = {
  x: 0.1,
  y: 0.1,
  scale: 0.8,
  rotation: 0,
};

/** Fit artwork into printable area without exceeding it. */
export function fitPlacementToArea(
  artworkWidthPx: number,
  artworkHeightPx: number,
  areaWidthPx: number,
  areaHeightPx: number
): DesignPlacement {
  if (artworkWidthPx <= 0 || artworkHeightPx <= 0) {
    return DEFAULT_PLACEMENT;
  }

  const scale = Math.min(
    (areaWidthPx * 0.85) / artworkWidthPx,
    (areaHeightPx * 0.85) / artworkHeightPx,
    1
  );

  const drawnWidth = artworkWidthPx * scale;
  const drawnHeight = artworkHeightPx * scale;

  return {
    x: (areaWidthPx - drawnWidth) / 2 / areaWidthPx,
    y: (areaHeightPx - drawnHeight) / 2 / areaHeightPx,
    scale: drawnWidth / areaWidthPx,
    rotation: 0,
  };
}

export function estimateMarginCents(
  salePriceCents: number,
  fulfillmentCostCents: number
): number {
  return salePriceCents - fulfillmentCostCents;
}
