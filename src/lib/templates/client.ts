import type { ProviderTemplate } from "@/lib/connectors/fulfillment/types";

export async function fetchProviderTemplateViaApi(
  providerKey: string,
  productId: string,
  areaId: string,
  color?: string
): Promise<{ template: ProviderTemplate | null; error?: string }> {
  const params = new URLSearchParams({
    providerKey,
    productId,
    areaId,
  });
  if (color) {
    params.set("color", color);
  }

  const response = await fetch(`/api/providers/template?${params.toString()}`);

  const json = (await response.json().catch(() => null)) as {
    template?: ProviderTemplate | null;
    error?: string;
  } | null;

  if (!response.ok) {
    return {
      template: null,
      error: json?.error ?? `Template fetch failed (${response.status}).`,
    };
  }

  return { template: json?.template ?? null, error: json?.error };
}
