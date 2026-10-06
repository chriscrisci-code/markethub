import {
  networkErrorMessage,
  parseJsonResponse,
} from "@/lib/api/client-fetch";
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

  try {
    const response = await fetch(
      `/api/providers/template?${params.toString()}`
    );

    const json = await parseJsonResponse<{
      template?: ProviderTemplate | null;
      error?: string;
    }>(response);

    if (response.status === 401) {
      return {
        template: null,
        error: "Session expired. Refresh the page and sign in again.",
      };
    }

    if (!response.ok) {
      return {
        template: null,
        error: json?.error ?? `Template fetch failed (${response.status}).`,
      };
    }

    return { template: json?.template ?? null, error: json?.error };
  } catch (error) {
    return {
      template: null,
      error: networkErrorMessage(error, "Could not load product template."),
    };
  }
}
