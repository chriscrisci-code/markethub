import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { readSiteAccess, updateSiteAccess } from "@/lib/auth/site-access";

export async function GET() {
  const { user, error } = await requireApiUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await readSiteAccess();
  return NextResponse.json({ username: access.username });
}

export async function PUT(request: Request) {
  const { user, error } = await requireApiUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;

  const result = await updateSiteAccess(
    String(body?.username ?? ""),
    String(body?.password ?? "")
  );
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
