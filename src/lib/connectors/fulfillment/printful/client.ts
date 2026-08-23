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

/**
 * Download artwork from our signed URL and upload it to Printful's file library
 * so mockup generation does not depend on Printful being able to fetch Supabase.
 */
export async function uploadArtworkUrlToPrintful(
  sourceUrl: string,
  filename = "artwork.png"
): Promise<{ id: number; url: string }> {
  let downloaded: Response;
  try {
    downloaded = await fetch(sourceUrl, {
      signal: timeoutSignal(20_000),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Could not download artwork from storage (timed out). Re-upload PNG/JPG and try again."
    );
  }

  if (!downloaded.ok) {
    throw new Error(
      `Could not download artwork from storage (${downloaded.status}). Re-upload PNG/JPG and try again.`
    );
  }

  const bytes = await downloaded.arrayBuffer();
  const contentType =
    downloaded.headers.get("content-type")?.split(";")[0]?.trim() ||
    "image/png";
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: contentType }),
    filename.replace(/[^\w.-]+/g, "_") || "artwork.png"
  );

  let response: Response;
  try {
    response = await fetch(`${PRINTFUL_API_BASE}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      body: form,
      cache: "no-store",
      signal: timeoutSignal(60_000),
    });
  } catch {
    throw new Error(
      "Printful file upload timed out. Try a smaller PNG/JPG and retry."
    );
  }

  const json = (await response.json().catch(() => null)) as {
    code?: number;
    result?: { id?: number; url?: string };
    error?: { message?: string } | string;
  } | null;

  if (!response.ok) {
    throw new PrintfulApiError(
      messageFromBody(json, `Printful file upload failed (${response.status})`),
      response.status,
      json
    );
  }

  const file = json?.result;
  if (!file?.id || !file?.url) {
    throw new Error("Printful file upload did not return a file URL.");
  }

  return { id: file.id, url: file.url };
}
