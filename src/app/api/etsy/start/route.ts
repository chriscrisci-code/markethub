import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import {
  ETSY_OAUTH_COOKIE,
  buildAuthorizeUrl,
  createOAuthState,
  createPkcePair,
  etsyConfig,
  sealOAuthCookie,
} from "@/lib/etsy/oauth";

function storefrontRedirect(request: Request, code: string) {
  const url = new URL("/storefronts", request.url);
  url.searchParams.set("etsy", code);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("redirect", "/storefronts");
    return NextResponse.redirect(login);
  }

  const connectionId = new URL(request.url).searchParams.get("connectionId") ?? "";
  if (!connectionId) {
    return storefrontRedirect(request, "error");
  }

  const { data: connection } = await supabase
    .from("connector_connections")
    .select("id, connector_key")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection || connection.connector_key !== "etsy") {
    return storefrontRedirect(request, "error");
  }

  const config = etsyConfig();
  if ("error" in config) {
    return storefrontRedirect(request, config.error);
  }

  const { verifier, challenge } = createPkcePair();
  const state = createOAuthState();
  const authorizeUrl = buildAuthorizeUrl({
    keystring: config.keystring,
    redirectUri: config.redirectUri,
    state,
    codeChallenge: challenge,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(
    ETSY_OAUTH_COOKIE,
    sealOAuthCookie({ state, verifier, connectionId }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 10,
    }
  );
  return response;
}
