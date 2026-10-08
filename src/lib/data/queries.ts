import { createClient } from "@/lib/supabase/server";
import { normalizePrintableAreas } from "@/lib/domain/artwork-sides";
import type { DashboardStats, ItemWithRelations } from "@/lib/types/database";
import type { OrderWithRelations } from "@/lib/types/orders";

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();

  const [itemsResult, publishedResult, ordersResult, attentionResult] =
    await Promise.all([
      supabase.from("items").select("id", { count: "exact", head: true }),
      supabase
        .from("channel_listings")
        .select("item_id", { count: "exact", head: true })
        .eq("sync_status", "published"),
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing"]),
    ]);

  return {
    totalItems: itemsResult.count ?? 0,
    publishedItems: publishedResult.count ?? 0,
    totalOrders: ordersResult.count ?? 0,
    ordersNeedingAttention: attentionResult.count ?? 0,
  };
}

export async function getItems(): Promise<ItemWithRelations[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("items")
    .select(
      `
      *,
      item_artwork (*),
      item_designs (*),
      item_variants (*),
      channel_listings (
        *,
        connector_registry:connector_key (display_name),
        storefront:connection_id (display_name)
      ),
      fulfillment_provider:fulfillment_provider_key (display_name)
    `
    )
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("getItems error:", error.message);
    return [];
  }

  return (data ?? []).map(normalizeItem) as unknown as ItemWithRelations[];
}

export async function getItem(itemId: string): Promise<ItemWithRelations | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("items")
    .select(
      `
      *,
      item_artwork (*),
      item_designs (*),
      item_variants (*),
      channel_listings (
        *,
        connector_registry:connector_key (display_name),
        storefront:connection_id (display_name)
      ),
      fulfillment_provider:fulfillment_provider_key (display_name)
    `
    )
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    console.error("getItem error:", error.message);
    return null;
  }

  if (!data) return null;

  const item = normalizeItem(data) as unknown as ItemWithRelations;

  if (item.item_designs?.id) {
    const { data: adjustments } = await supabase
      .from("provider_design_adjustments")
      .select("*")
      .eq("item_design_id", item.item_designs.id)
      .order("created_at", { ascending: false });

    item.provider_design_adjustments = adjustments ?? [];
  } else {
    item.provider_design_adjustments = [];
  }

  const { data: mockups, error: mockupsError } = await supabase
    .from("item_mockups")
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });

  if (mockupsError) {
    console.error("getItem mockups error:", mockupsError.message);
    item.item_mockups = [];
  } else {
    item.item_mockups = mockups ?? [];
  }

  return item;
}

function normalizeItem(row: Record<string, unknown>) {
  const designs = row.item_designs;
  const artwork = row.item_artwork;
  const designRow = Array.isArray(designs) ? designs[0] ?? null : designs ?? null;

  let itemDesigns = designRow as Record<string, unknown> | null;
  if (itemDesigns) {
    const rawAreas =
      itemDesigns.printable_areas ?? itemDesigns.printable_area ?? {};
    itemDesigns = {
      ...itemDesigns,
      printable_areas: normalizePrintableAreas(rawAreas),
    };
    delete itemDesigns.printable_area;
  }

  const artworkList: unknown[] = Array.isArray(artwork)
    ? artwork
    : artwork
      ? [artwork]
      : [];

  return {
    ...row,
    item_artwork: artworkList.map((a) => {
      const rowArt = a as Record<string, unknown>;
      return {
        ...rowArt,
        side: rowArt.side === "back" ? "back" : "front",
      };
    }),
    item_designs: itemDesigns,
    item_variants: Array.isArray(row.item_variants) ? row.item_variants : [],
    item_mockups: Array.isArray(row.item_mockups) ? row.item_mockups : [],
    channel_listings: Array.isArray(row.channel_listings)
      ? row.channel_listings
      : [],
    provider_design_adjustments: [],
  };
}

/** One row per connected shop. Creates Market Hub Store + Mock if the user has none. */
export async function getStorefronts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { count } = await supabase
    .from("connector_connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) === 0) {
    await supabase.from("connector_connections").insert([
      {
        user_id: user.id,
        connector_key: "market-hub-store",
        display_name: "Market Hub Store",
        status: "connected",
      },
      {
        user_id: user.id,
        connector_key: "mock-marketplace",
        display_name: "Mock Marketplace",
        status: "connected",
      },
    ]);
  }

  const { data, error } = await supabase
    .from("connector_connections")
    .select("id, connector_key, display_name, status")
    .eq("user_id", user.id)
    .order("display_name");

  if (error) {
    console.error("getStorefronts error:", error.message);
    return [];
  }

  return data ?? [];
}

export async function getFulfillmentProviders() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("connector_registry")
    .select("*")
    .eq("type", "fulfillment")
    .eq("is_enabled", true)
    .order("display_name");

  if (error) {
    console.error("getFulfillmentProviders error:", error.message);
    return [];
  }

  return data ?? [];
}

export async function getMarketplaceConnectors() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("connector_registry")
    .select("*")
    .eq("type", "marketplace")
    .eq("is_enabled", true)
    .order("display_name");

  if (error) {
    console.error("getMarketplaceConnectors error:", error.message);
    return [];
  }

  return data ?? [];
}

export async function getArtworkUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("artwork")
    .createSignedUrl(storagePath, 3600);

  return data?.signedUrl ?? null;
}

export async function getMockupUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("mockups")
    .createSignedUrl(storagePath, 60 * 60 * 24);

  return data?.signedUrl ?? null;
}

export async function getOrders(): Promise<OrderWithRelations[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      order_line_items (*),
      fulfillment_jobs (*),
      order_costs (*),
      source_connector:source_connector_key (display_name)
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getOrders error:", error.message);
    return [];
  }

  return (data ?? []).map(normalizeOrder) as unknown as OrderWithRelations[];
}

export async function getOrder(
  orderId: string
): Promise<OrderWithRelations | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      order_line_items (*),
      fulfillment_jobs (*),
      order_costs (*),
      source_connector:source_connector_key (display_name)
    `
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("getOrder error:", error.message);
    return null;
  }

  if (!data) return null;
  return normalizeOrder(data) as unknown as OrderWithRelations;
}

function normalizeOrder(row: Record<string, unknown>) {
  return {
    ...row,
    order_line_items: Array.isArray(row.order_line_items)
      ? row.order_line_items
      : [],
    fulfillment_jobs: Array.isArray(row.fulfillment_jobs)
      ? row.fulfillment_jobs
      : [],
    order_costs: Array.isArray(row.order_costs) ? row.order_costs : [],
    source_connector: row.source_connector ?? null,
  };
}
