import { createClient } from "@/lib/supabase/server";
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
        connector_registry:connector_key (display_name)
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
        connector_registry:connector_key (display_name)
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

  return item;
}

function normalizeItem(row: Record<string, unknown>) {
  const designs = row.item_designs;
  const artwork = row.item_artwork;

  return {
    ...row,
    item_artwork: Array.isArray(artwork) ? artwork[0] ?? null : artwork ?? null,
    item_designs: Array.isArray(designs) ? designs[0] ?? null : designs ?? null,
    item_variants: Array.isArray(row.item_variants) ? row.item_variants : [],
    channel_listings: Array.isArray(row.channel_listings)
      ? row.channel_listings
      : [],
    provider_design_adjustments: [],
  };
}

/** Ensures default marketplace channel rows exist (no revalidate — safe during render). */
export async function ensureChannelListings(itemId: string) {
  const supabase = await createClient();
  const marketplaceKeys = ["mock-marketplace", "market-hub-store"];

  await supabase.from("channel_listings").upsert(
    marketplaceKeys.map((connector_key) => ({
      item_id: itemId,
      connector_key,
      sync_status: "not_published" as const,
    })),
    { onConflict: "item_id,connector_key" }
  );
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
