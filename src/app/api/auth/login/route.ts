import { NextResponse } from "next/server";
import { credentialsMatch, readSiteAccess, openOwnerSession } from "@/lib/auth/site-access";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;

  const username = String(body?.username ?? "");
  const password = String(body?.password ?? "");
  const access = await readSiteAccess();

  if (!credentialsMatch(access, username, password)) {
    return NextResponse.json(
      { error: "Username or password is incorrect." },
      { status: 401 }
    );
  }

  const session = await openOwnerSession();
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
