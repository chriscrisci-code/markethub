import {
  apiFetch,
  networkErrorMessage,
  parseJsonResponse,
} from "@/lib/api/client-fetch";

export async function updateItemViaApi(
  itemId: string,
  payload: {
    name: string;
    description: string;
    price: string;
    status: string;
    fulfillment_provider_key: string;
  }
): Promise<{ success?: true; error?: string }> {
  try {
    const response = await apiFetch(`/api/items/${itemId}`, {
      method: "PATCH",
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
      error: networkErrorMessage(error, "Could not save item."),
    };
  }
}
