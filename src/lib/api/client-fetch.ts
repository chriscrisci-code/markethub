/** Map low-level fetch failures into actionable UI messages. */
export function networkErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.trim();
  if (
    message === "Failed to fetch" ||
    message === "NetworkError when attempting to fetch resource." ||
    message.includes("NetworkError") ||
    error.name === "TypeError"
  ) {
    return (
      "Could not reach the server. Hard-refresh the page, sign in again if needed, " +
      "and retry. If it keeps failing, check Vercel env vars and that Supabase is Healthy."
    );
  }

  return message || fallback;
}

/** Shared fetch defaults for same-origin admin API calls. */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
  });
}

export async function parseJsonResponse<T>(
  response: Response
): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}
