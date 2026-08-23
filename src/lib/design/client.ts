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
