const PRINTFUL_API_BASE = "https://api.printful.com";

/** Default timeout for Printful HTTP calls (ms). */
export const PRINTFUL_FETCH_TIMEOUT_MS = 25_000;

export class PrintfulApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "PrintfulApiError";
  }
}

export function hasPrintfulToken(): boolean {
  return Boolean(process.env.PRINTFUL_API_TOKEN?.trim());
}

function getToken(): string {
  const token = process.env.PRINTFUL_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "PRINTFUL_API_TOKEN is not set. Add it to .env.local and Vercel env vars."
    );
  }
  return token;
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function messageFromBody(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const body = json as {
    error?: { message?: string } | string;
    result?: string;
    message?: string;
  };
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  if (
    body.error &&
    typeof body.error === "object" &&
    body.error.message?.trim()
  ) {
    return body.error.message;
  }
  if (typeof body.result === "string" && body.result.trim()) return body.result;
  if (typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }
  return fallback;
}

export async function printfulFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs = PRINTFUL_FETCH_TIMEOUT_MS, ...rest } = init ?? {};
  let response: Response;
  try {
    response = await fetch(`${PRINTFUL_API_BASE}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
        ...(rest.headers ?? {}),
      },
      cache: "no-store",
      signal: rest.signal ?? timeoutSignal(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `Printful timed out after ${timeoutMs / 1000}s (${path}). Try again.`
      );
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Printful request aborted/timed out (${path}). Try again.`
      );
    }
    throw error;
  }

  const json = (await response.json().catch(() => null)) as {
    code?: number;
    result?: T;
    error?: { message?: string } | string;
  } | null;

  if (!response.ok) {
    throw new PrintfulApiError(
      messageFromBody(json, `Printful API error (${response.status})`),
      response.status,
      json
    );
  }

  if (json && typeof json.code === "number" && json.code !== 200) {
    throw new PrintfulApiError(
      messageFromBody(json, `Printful API error (code ${json.code})`),
      json.code,
      json
    );
  }

  return (json?.result ?? json) as T;
}
