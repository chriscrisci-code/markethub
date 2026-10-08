import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getMarketplaceConnector } from "@/lib/connectors/marketplace/registry";

const ALLOWED_KEYS = new Set(["etsy", "market-hub-store", "mock-marketplace"]);

const DEFAULTS = [
  { connector_key: "market-hub-store", display_name: "Market Hub Store" },
  { connector_key: "mock-marketplace", display_name: "Mock Marketplace" },
];

export async function GET() {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count } = await supabase
    .from("connector_connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) === 0) {
    await supabase.from("connector_connections").insert(
      DEFAULTS.map((row) => ({
        user_id: user.id,
        connector_key: row.connector_key,
        display_name: row.display_name,
        status: "connected",
      }))
    );
  }

  const { data, error } = await supabase
    .from("connector_connections")
    .select("id, connector_key, display_name, status, external_account_id")
    .eq("user_id", user.id)
    .order("display_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ storefronts: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { connectorKey?: string; displayName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const connectorKey = body.connectorKey ?? "";
  const displayName = body.displayName?.trim() ?? "";

  if (!ALLOWED_KEYS.has(connectorKey)) {
    return NextResponse.json(
      { error: "Choose Etsy, Market Hub Store, or Mock Marketplace." },
      { status: 400 }
    );
  }

  if (!displayName) {
    return NextResponse.json(
      { error: "Give this storefront a name (for example, Etsy Shop A)." },
      { status: 400 }
    );
  }

  if (!getMarketplaceConnector(connectorKey)) {
    return NextResponse.json({ error: "Unknown sales channel." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("connector_connections")
    .insert({
      user_id: user.id,
      connector_key: connectorKey,
      display_name: displayName,
      status: "connected",
    })
    .select("id, connector_key, display_name, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ storefront: data });
}
