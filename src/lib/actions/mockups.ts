"use server";

import { getFulfillmentConnector } from "@/lib/connectors/fulfillment/registry";
import type { ProviderMockupResult } from "@/lib/connectors/fulfillment/types";
import type { DesignPlacement } from "@/lib/types/database";

/** Allow download → Printful upload → create-task on Vercel. */
export const maxDuration = 60;

/** Same shape as the first working mockup: one print file (usually front). */
export async function startProviderMockup(input: {
  providerKey: string;
  productId: string;
  color: string;
  size: string;
  areaId: string;
  artworkUrl: string;
  areaWidthPx: number;
  areaHeightPx: number;
  placement: DesignPlacement;
  artworkWidthPx: number;
  artworkHeightPx: number;
}): Promise<{ taskKey?: string; error?: string }> {
  const connector = getFulfillmentConnector(input.providerKey);
  if (!connector?.startMockupGeneration) {
    return {
      error: "This fulfillment provider does not support mockup generation yet.",
    };
  }

  try {
    const { taskKey } = await connector.startMockupGeneration(input);
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
