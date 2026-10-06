import {
  apiFetch,
  networkErrorMessage,
  parseJsonResponse,
} from "@/lib/api/client-fetch";
import type {
  ArtworkSide,
  PrintableAreasMap,
  ProviderProductRef,
} from "@/lib/types/database";

export async function saveItemDesignViaApi(
  itemId: string,
  payload: {
    providerProductRef: ProviderProductRef;
    printableAreas: PrintableAreasMap;
    variants: Array<{ color: string; size: string }>;
  }
): Promise<{ success?: true; error?: string }> {
  try {
    const response = await apiFetch(`/api/items/${itemId}/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await parseJsonResponse<{
      success?: boolean;
      error?: string;
    }>(response);

    if (response.status === 401) {
      return {
        error: "Session expired. Refresh the page and sign in again.",
      };
    }

    if (!response.ok) {
      return {
        error: json?.error ?? `Save failed (${response.status}).`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      error: networkErrorMessage(error, "Could not save design."),
    };
  }
}

type DimKey = `${string}:${ArtworkSide}`;
type DimPair = { widthPx: number; heightPx: number };

const DEBOUNCE_MS = 600;

/** Last dimensions successfully persisted (or intentionally skipped as unchanged). */
const lastSavedByKey = new Map<DimKey, DimPair>();
/** Latest dimensions requested while a timer/in-flight request is outstanding. */
const pendingByKey = new Map<DimKey, DimPair>();
const timersByKey = new Map<DimKey, ReturnType<typeof setTimeout>>();
const inFlightKeys = new Set<DimKey>();
/** Keys that failed once — do not auto-retry the same dimensions forever. */
const failedIdenticalByKey = new Map<DimKey, DimPair>();

function dimKey(itemId: string, side: ArtworkSide): DimKey {
  return `${itemId}:${side}`;
}

function sameDims(a: DimPair | undefined, b: DimPair): boolean {
  return Boolean(a && a.widthPx === b.widthPx && a.heightPx === b.heightPx);
}

async function flushArtworkDimensions(
  itemId: string,
  side: ArtworkSide
): Promise<void> {
  const key = dimKey(itemId, side);
  const next = pendingByKey.get(key);
  if (!next) return;

  if (sameDims(lastSavedByKey.get(key), next)) {
    pendingByKey.delete(key);
    return;
  }

  // A previous failure for these exact dims — don't hammer the API.
  if (sameDims(failedIdenticalByKey.get(key), next)) {
    pendingByKey.delete(key);
    return;
  }

  if (inFlightKeys.has(key)) {
    return;
  }

  inFlightKeys.add(key);
  pendingByKey.delete(key);

  try {
    const response = await apiFetch(`/api/items/${itemId}/artwork-dimensions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        side,
        widthPx: next.widthPx,
        heightPx: next.heightPx,
      }),
    });

    if (!response.ok) {
      failedIdenticalByKey.set(key, next);
      return;
    }

    lastSavedByKey.set(key, next);
    failedIdenticalByKey.delete(key);
  } catch {
    // Non-blocking for placement; mark failed so we don't retry forever.
    failedIdenticalByKey.set(key, next);
  } finally {
    inFlightKeys.delete(key);

    // If newer dims arrived while in-flight, schedule one more flush.
    const queued = pendingByKey.get(key);
    if (queued && !sameDims(lastSavedByKey.get(key), queued)) {
      const existing = timersByKey.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timersByKey.delete(key);
        void flushArtworkDimensions(itemId, side);
      }, DEBOUNCE_MS);
      timersByKey.set(key, timer);
    }
  }
}

/**
 * Best-effort artwork pixel size update.
 * Debounced, deduped, and skipped when dimensions are unchanged.
 * Failures do not retry the same payload indefinitely.
 */
export function updateArtworkDimensionsViaApi(
  itemId: string,
  widthPx: number,
  heightPx: number,
  side: ArtworkSide = "front"
): void {
  if (
    !Number.isFinite(widthPx) ||
    !Number.isFinite(heightPx) ||
    widthPx <= 0 ||
    heightPx <= 0
  ) {
    return;
  }

  const key = dimKey(itemId, side);
  const next = {
    widthPx: Math.round(widthPx),
    heightPx: Math.round(heightPx),
  };

  if (sameDims(lastSavedByKey.get(key), next)) {
    return;
  }

  if (sameDims(failedIdenticalByKey.get(key), next)) {
    return;
  }

  pendingByKey.set(key, next);

  const existing = timersByKey.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    timersByKey.delete(key);
    void flushArtworkDimensions(itemId, side);
  }, DEBOUNCE_MS);
  timersByKey.set(key, timer);
}
