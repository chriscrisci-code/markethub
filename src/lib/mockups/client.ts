import {
  apiFetch,
  networkErrorMessage,
  parseJsonResponse,
} from "@/lib/api/client-fetch";
import type {
  MockupPrintFile,
  ProviderMockupResult,
} from "@/lib/connectors/fulfillment/types";

export async function startMockupViaApi(input: {
  providerKey: string;
  productId: string;
  color: string;
  size: string;
  files: MockupPrintFile[];
}): Promise<{ taskKey?: string; error?: string }> {
  try {
    const response = await apiFetch("/api/printful/mockups/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const json = await parseJsonResponse<{
      taskKey?: string;
      error?: string;
    }>(response);

    if (response.status === 401) {
      return {
        error: "Session expired. Refresh the page and sign in again.",
      };
    }

    if (!response.ok) {
      return {
        error: json?.error ?? `Mockup start failed (${response.status}).`,
      };
    }

    return { taskKey: json?.taskKey, error: json?.error };
  } catch (error) {
    return {
      error: networkErrorMessage(error, "Could not start mockup."),
    };
  }
}

export async function pollMockupViaApi(
  providerKey: string,
  taskKey: string
): Promise<{ result?: ProviderMockupResult; error?: string }> {
  try {
    const params = new URLSearchParams({ providerKey, taskKey });
    const response = await apiFetch(
      `/api/printful/mockups/task?${params.toString()}`
    );

    const json = await parseJsonResponse<{
      result?: ProviderMockupResult;
      error?: string;
    }>(response);

    if (response.status === 401) {
      return {
        error: "Session expired. Refresh the page and sign in again.",
      };
    }

    if (!response.ok) {
      return {
        error: json?.error ?? `Mockup poll failed (${response.status}).`,
      };
    }

    return { result: json?.result, error: json?.error };
  } catch (error) {
    return {
      error: networkErrorMessage(error, "Could not poll mockup status."),
    };
  }
}
