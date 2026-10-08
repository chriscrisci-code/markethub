import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import {
  ETSY_OAUTH_COOKIE,
  etsyConfig,
  exchangeAuthorizationCode,
  fetchEtsyShopId,
  markEtsyConnectionError,
  oauthValuesMatch,
  openOAuthCookie,
  storeEtsyConnection,
} from "@/lib/etsy/oauth";

function finish(request: Request, code: string) {
  const url = new URL("/storefronts", request.url);
  url.searchParams.set("etsy", code);
  const response = NextResponse.redirect(url);
  response.cookies.set(ETSY_OAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const { user, error: authError } = await requireApiUser();
  if (authError || !user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("redirect", "/storefronts");
    return NextResponse.redirect(login);
  }

  const url = new URL(request.url);
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ETSY_OAUTH_COOKIE}=`))
    ?.slice(ETSY_OAUTH_COOKIE.length + 1);

  const pending = cookie ? openOAuthCookie(decodeURIComponent(cookie)) : null;
  if (!pending) {
    return finish(request, "error");
  }

  const returnedState = url.searchParams.get("state") ?? "";
  if (!oauthValuesMatch(returnedState, pending.state)) {
    return finish(request, "error");
  }

  const etsyError = url.searchParams.get("error");
  if (etsyError === "access_denied") {
    return finish(request, "cancelled");
  }
  if (etsyError) {
    await markEtsyConnectionError(pending.connectionId, user.id);
    return finish(request, "error");
  }

  const code = url.searchParams.get("code");
  const config = etsyConfig();
  if (!code || "error" in config) {
    await markEtsyConnectionError(pending.connectionId, user.id);
    return finish(request, "error");
  }

  try {
    const bundle = await exchangeAuthorizationCode(config, code, pending.verifier);
    const shopId = await fetchEtsyShopId(config, bundle.accessToken);
    await storeEtsyConnection({
      connectionId: pending.connectionId,
      userId: user.id,
      bundle,
      shopId,
    });
    return finish(request, "connected");
  } catch {
    await markEtsyConnectionError(pending.connectionId, user.id);
    return finish(request, "error");
  }
}
