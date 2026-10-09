import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  decryptJson,
  encryptJson,
  isEncryptedPayload,
  type EtsyTokenBundle,
} from "@/lib/etsy/tokens";

export type EtsyOAuthPending = {
  state: string;
  verifier: string;
  connectionId: string;
};

const AUTHORIZE_URL = "https://www.etsy.com/oauth/connect";
const TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const API_ROOT = "https://openapi.etsy.com/v3/application";

/** Shop identity plus listing create/update. Reconnect after this change. */
export const ETSY_CONNECT_SCOPE = "shops_r listings_r listings_w";

const REFRESH_WINDOW_MS = 2 * 60 * 1000;

export const ETSY_OAUTH_COOKIE = "mh_etsy_oauth";

type EtsyConfig = {
  keystring: string;
  sharedSecret: string;
  redirectUri: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export function etsyRedirectUri(): string | null {
  const explicit = process.env.ETSY_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!appUrl) return null;
  return `${appUrl}/api/etsy/callback`;
}

export function etsyConfig(): EtsyConfig | { error: string } {
  const keystring = process.env.ETSY_KEYSTRING?.trim() ?? "";
  const sharedSecret = process.env.ETSY_SHARED_SECRET?.trim() ?? "";
  const redirectUri = etsyRedirectUri();

  if (!keystring || !sharedSecret || !process.env.ETSY_TOKEN_KEY) {
    return { error: "config" };
  }
  if (!redirectUri || !redirectUri.startsWith("https://")) {
    return { error: "https" };
  }

  return { keystring, sharedSecret, redirectUri };
}

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function oauthValuesMatch(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function sealOAuthCookie(pending: EtsyOAuthPending) {
  return Buffer.from(JSON.stringify(encryptJson(pending)), "utf8").toString("base64url");
}

export function openOAuthCookie(raw: string): EtsyOAuthPending | null {
  try {
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!isEncryptedPayload(payload)) return null;
    const pending = decryptJson<EtsyOAuthPending>(payload);
    if (!pending.state || !pending.verifier || !pending.connectionId) return null;
    return pending;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(input: {
  keystring: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.keystring);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", ETSY_CONNECT_SCOPE);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

function apiKeyHeader(config: EtsyConfig) {
  return `${config.keystring}:${config.sharedSecret}`;
}

async function requestToken(
  config: EtsyConfig,
  body: URLSearchParams
): Promise<EtsyTokenBundle> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-api-key": apiKeyHeader(config),
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Etsy token request failed.");
  }

  const json = (await response.json()) as TokenResponse;
  if (!json.access_token || !json.refresh_token || !json.expires_in) {
    throw new Error("Etsy token response was incomplete.");
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    scope: json.scope,
  };
}

export async function exchangeAuthorizationCode(
  config: EtsyConfig,
  code: string,
  verifier: string
) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.keystring,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: verifier,
  });
  return requestToken(config, body);
}

export async function refreshEtsyTokens(
  config: EtsyConfig,
  refreshToken: string
) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.keystring,
    refresh_token: refreshToken,
  });
  return requestToken(config, body);
}

export async function fetchEtsyShopId(config: EtsyConfig, accessToken: string) {
  const userId = accessToken.split(".")[0] ?? "";
  if (!/^\d+$/.test(userId)) {
    throw new Error("Etsy access token did not include a user id.");
  }

  const response = await fetch(`${API_ROOT}/users/${userId}/shops`, {
    headers: {
      "x-api-key": apiKeyHeader(config),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Etsy shop lookup failed.");
  }

  const shop = (await response.json()) as { shop_id?: number };
  if (!shop.shop_id) {
    throw new Error("Etsy did not return a shop id.");
  }

  return String(shop.shop_id);
}

async function saveTokenBundle(
  connectionId: string,
  userId: string,
  bundle: EtsyTokenBundle,
  shopId?: string
) {
  const service = createServiceClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const patch: {
    credentials: ReturnType<typeof encryptJson>;
    status: "connected";
    external_account_id?: string;
  } = {
    credentials: encryptJson(bundle),
    status: "connected",
  };
  if (shopId) {
    patch.external_account_id = shopId;
  }

  const { error } = await service
    .from("connector_connections")
    .update(patch)
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("connector_key", "etsy");

  if (error) {
    throw new Error("Could not store the Etsy connection.");
  }
}

/** Server-only. Returns a usable access token, refreshing it when it is near expiry. */
export async function getValidEtsyAccessToken(connectionId: string, userId: string) {
  const config = etsyConfig();
  if ("error" in config) {
    return { error: "Etsy is not configured." as const };
  }

  const service = createServiceClient();
  if (!service) {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." as const };
  }

  const { data, error } = await service
    .from("connector_connections")
    .select("credentials")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("connector_key", "etsy")
    .maybeSingle();

  if (error || !data || !isEncryptedPayload(data.credentials)) {
    return { error: "This Etsy shop is not connected." as const };
  }

  let bundle: EtsyTokenBundle;
  try {
    bundle = decryptJson<EtsyTokenBundle>(data.credentials);
  } catch {
    return { error: "Stored Etsy credentials could not be read." as const };
  }

  const expiresAt = Date.parse(bundle.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_WINDOW_MS) {
    return { accessToken: bundle.accessToken };
  }

  try {
    const refreshed = await refreshEtsyTokens(config, bundle.refreshToken);
    if (!refreshed.scope && bundle.scope) {
      refreshed.scope = bundle.scope;
    }
    await saveTokenBundle(connectionId, userId, refreshed);
    return { accessToken: refreshed.accessToken };
  } catch {
    await service
      .from("connector_connections")
      .update({ status: "error" })
      .eq("id", connectionId)
      .eq("user_id", userId)
      .eq("connector_key", "etsy");
    return { error: "Etsy token refresh failed." as const };
  }
}

export async function storeEtsyConnection(input: {
  connectionId: string;
  userId: string;
  bundle: EtsyTokenBundle;
  shopId: string;
}) {
  await saveTokenBundle(
    input.connectionId,
    input.userId,
    input.bundle,
    input.shopId
  );
}

export async function markEtsyConnectionError(connectionId: string, userId: string) {
  const service = createServiceClient();
  if (!service) return;

  await service
    .from("connector_connections")
    .update({ status: "error" })
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("connector_key", "etsy");
}
