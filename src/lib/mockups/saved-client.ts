import {
  apiFetch,
  networkErrorMessage,
  parseJsonResponse,
} from "@/lib/api/client-fetch";

export type SavedMockup = {
  id: string;
  item_id: string;
  storage_path: string;
  source_url: string | null;
  label: string | null;
  color_name: string | null;
  fulfillment_provider_key: string | null;
  fulfillment_provider_name: string | null;
  variant_id: string | null;
  created_at: string;
  url: string | null;
};

export async function listSavedMockupsViaApi(
  itemId: string
): Promise<{ mockups?: SavedMockup[]; error?: string }> {
  try {
    const response = await apiFetch(`/api/items/${itemId}/mockups`);
    const json = await parseJsonResponse<{
      mockups?: SavedMockup[];
      error?: string;
    }>(response);

    if (!response.ok) {
      return {
        error: json?.error ?? `Could not load saved mockups (${response.status}).`,
      };
    }

    return { mockups: json?.mockups ?? [] };
  } catch (error) {
    return {
      error: networkErrorMessage(error, "Could not load saved mockups."),
    };
  }
}

export async function saveMockupViaApi(
  itemId: string,
  imageUrl: string,
  options: { color: string; sizes?: string[]; label?: string }
): Promise<{ mockup?: SavedMockup; error?: string }> {
  try {
    const response = await apiFetch(`/api/items/${itemId}/mockups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl,
        color: options.color,
        sizes: options.sizes ?? [],
        label: options.label,
      }),
    });

    const json = await parseJsonResponse<{
      mockup?: SavedMockup;
      error?: string;
    }>(response);

    if (!response.ok) {
      return {
        error: json?.error ?? `Could not save mockup (${response.status}).`,
      };
    }

    return { mockup: json?.mockup };
  } catch (error) {
    return {
      error: networkErrorMessage(error, "Could not save mockup."),
    };
  }
}

export async function deleteSavedMockupViaApi(
  itemId: string,
  mockupId: string
): Promise<{ success?: true; error?: string }> {
  try {
    const response = await apiFetch(
      `/api/items/${itemId}/mockups/${mockupId}`,
      { method: "DELETE" }
    );

    const json = await parseJsonResponse<{ error?: string }>(response);

    if (!response.ok) {
      return {
        error: json?.error ?? `Could not delete mockup (${response.status}).`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      error: networkErrorMessage(error, "Could not delete mockup."),
    };
  }
}
