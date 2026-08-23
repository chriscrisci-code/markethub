"use server";

import { getFulfillmentConnector } from "@/lib/connectors/fulfillment/registry";
import type { ProviderTemplate } from "@/lib/connectors/fulfillment/types";

export async function fetchProviderTemplate(
  providerKey: string,
  productId: string,
  areaId: string,
  color?: string
): Promise<{ template: ProviderTemplate | null; error?: string }> {
  const connector = getFulfillmentConnector(providerKey);
  if (!connector?.getProductTemplate) {
    return { template: null };
  }

  try {
    const template = await connector.getProductTemplate(
      { id: productId },
      { areaId, color }
    );
    return { template };
  } catch (error) {
    return {
      template: null,
      error:
        error instanceof Error ? error.message : "Failed to load product template.",
    };
  }
}
