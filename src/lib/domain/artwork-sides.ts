import type {
  ArtworkSide,
  ItemArtwork,
  PrintableAreaState,
  PrintableAreasMap,
} from "@/lib/types/database";
import type {
  PrintableArea,
  ProviderProduct,
} from "@/lib/connectors/fulfillment/types";

export function isArtworkSide(value: unknown): value is ArtworkSide {
  return value === "front" || value === "back";
}

/** Normalize DB printable_areas / legacy printable_area into a side map. */
export function normalizePrintableAreas(raw: unknown): PrintableAreasMap {
  if (!raw || typeof raw !== "object") return {};

  const obj = raw as Record<string, unknown>;

  // Legacy single PrintableAreaState
  if ("areaId" in obj || "placement" in obj) {
    const area = obj as unknown as PrintableAreaState;
    const side = isArtworkSide(area.areaId) ? area.areaId : "front";
    return { [side]: area };
  }

  const result: PrintableAreasMap = {};
  for (const side of ["front", "back"] as const) {
    const entry = obj[side];
    if (entry && typeof entry === "object" && "areaId" in (entry as object)) {
      result[side] = entry as PrintableAreaState;
    }
  }
  return result;
}

export function artworkBySide(
  rows: ItemArtwork[] | ItemArtwork | null | undefined
): Record<ArtworkSide, ItemArtwork | null> {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const front =
    list.find((a) => a.side === "front") ??
    list.find((a) => !a.side) ??
    null;
  const back = list.find((a) => a.side === "back") ?? null;
  return { front, back };
}

export function primaryArtwork(
  rows: ItemArtwork[] | ItemArtwork | null | undefined
): ItemArtwork | null {
  const bySide = artworkBySide(rows);
  return bySide.front ?? bySide.back;
}

/** Resolve front/back printable areas from a provider product catalog entry. */
export function getProductSideAreas(product: ProviderProduct): {
  front: PrintableArea | null;
  back: PrintableArea | null;
} {
  let front =
    product.printableAreas.find(
      (a) =>
        a.id.toLowerCase() === "front" ||
        a.label.toLowerCase().includes("front")
    ) ?? null;
  let back =
    product.printableAreas.find(
      (a) =>
        a.id.toLowerCase() === "back" || a.label.toLowerCase().includes("back")
    ) ?? null;

  if (!front) {
    front =
      product.printableAreas.find((a) => a.id.toLowerCase() !== "back") ??
      product.printableAreas[0] ??
      null;
  }

  // Apparel often omits an explicit back row; mirror front dims so back art can be placed.
  if (!back && front) {
    back = {
      ...front,
      id: "back",
      label: "Back print",
    };
  }

  return { front, back };
}
