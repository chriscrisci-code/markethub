"use server";

import { getFulfillmentConnector } from "@/lib/connectors/fulfillment/registry";
import type { ProviderMockupResult } from "@/lib/connectors/fulfillment/types";
import { createClient } from "@/lib/supabase/server";
import type { DesignPlacement } from "@/lib/types/database";

async function freshArtworkUrlForMockup(
  storagePath: string
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("artwork")
    .createSignedUrl(storagePath, 60 * 60 * 24);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ?? "Could not create artwork URL for mockup."
    );
  }

  return data.signedUrl;
}

/** Same shape as the first working mockup: one print file (usually front). */
export async function startProviderMockup(input: {
  providerKey: string;
  productId: string;
  color: string;
  size: string;
  areaId: string;
  artworkUrl: string;
  artworkStoragePath?: string | null;
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

  let artworkUrl = input.artworkUrl;
  if (input.artworkStoragePath) {
    try {
      artworkUrl = await freshArtworkUrlForMockup(input.artworkStoragePath);
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Could not prepare artwork URL for mockup.",
      };
    }
  }

  try {
    const { taskKey } = await connector.startMockupGeneration({
      ...input,
      artworkUrl,
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
