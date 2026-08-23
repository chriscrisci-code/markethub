import type { PrintableAreasMap, ProviderProductRef } from "@/lib/types/database";

export async function saveItemDesignViaApi(
  itemId: string,
  payload: {
    providerProductRef: ProviderProductRef;
    printableAreas: PrintableAreasMap;
    variants: Array<{ color: string; size: string }>;
  }
): Promise<{ success?: true; error?: string }> {
  const response = await fetch(`/api/items/${itemId}/design`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
  } | null;

  if (!response.ok) {
    return {
      error: json?.error ?? `Save failed (${response.status}).`,
    };
  }

  return { success: true };
}

/** Best-effort artwork pixel size update; failures are ignored. */
export function updateArtworkDimensionsViaApi(
  itemId: string,
  widthPx: number,
  heightPx: number,
  side: "front" | "back" = "front"
): void {
  void fetch(`/api/items/${itemId}/artwork-dimensions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ side, widthPx, heightPx }),
  }).catch(() => {
    // Non-blocking; placement still works with local dimensions.
  });
}
