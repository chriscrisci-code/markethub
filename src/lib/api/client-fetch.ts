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
      "Could not reach the server. If you just returned after a while, " +
      "check that your Supabase project is not paused, then refresh and sign in again."
    );
  }

  return message || fallback;
}

export async function parseJsonResponse<T>(
  response: Response
): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}
