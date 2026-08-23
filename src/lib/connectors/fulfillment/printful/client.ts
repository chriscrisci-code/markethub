const PRINTFUL_API_BASE = "https://api.printful.com";

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

export async function printfulFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${PRINTFUL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as {
    code?: number;
    result?: T;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new PrintfulApiError(
      json?.error?.message ?? `Printful API error (${response.status})`,
      response.status,
      json
    );
  }

  return (json?.result ?? json) as T;
}
