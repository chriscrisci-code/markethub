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
  const response = await fetch("/api/printful/mockups/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const json = (await response.json().catch(() => null)) as {
    taskKey?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    return { error: json?.error ?? `Mockup start failed (${response.status}).` };
  }

  return { taskKey: json?.taskKey, error: json?.error };
}

export async function pollMockupViaApi(
  providerKey: string,
  taskKey: string
): Promise<{ result?: ProviderMockupResult; error?: string }> {
  const params = new URLSearchParams({ providerKey, taskKey });
  const response = await fetch(`/api/printful/mockups/task?${params.toString()}`);

  const json = (await response.json().catch(() => null)) as {
    result?: ProviderMockupResult;
    error?: string;
  } | null;

  if (!response.ok) {
    return { error: json?.error ?? `Mockup poll failed (${response.status}).` };
  }

  return { result: json?.result, error: json?.error };
}
