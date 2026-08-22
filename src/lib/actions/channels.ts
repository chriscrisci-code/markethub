"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMarketplaceConnector } from "@/lib/connectors/marketplace/registry";
import type { MasterItem } from "@/lib/connectors/marketplace/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

async function loadMasterItem(itemId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("items")
    .select("*, item_artwork (*)")
    .eq("id", itemId)
    .maybeSingle();

  if (error || !data) {
    return { error: error?.message ?? "Item not found." };
  }

  const artwork = Array.isArray(data.item_artwork)
    ? data.item_artwork[0] ?? null
    : data.item_artwork ?? null;

  const masterItem: MasterItem = {
    ...(data as MasterItem),
    artwork,
  };

  return { supabase, masterItem };
}

export async function publishToChannel(itemId: string, connectorKey: string) {
  const loaded = await loadMasterItem(itemId);
  if ("error" in loaded && loaded.error) {
    return { error: loaded.error };
  }

  const { supabase, masterItem } = loaded as {
    supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
    masterItem: MasterItem;
  };

  const connector = getMarketplaceConnector(connectorKey);
  if (!connector) {
    return { error: "Sales channel connector not found." };
  }

  try {
    const result = await connector.publishListing(masterItem);

    const { error } = await supabase.from("channel_listings").upsert(
      {
        item_id: itemId,
        connector_key: connectorKey,
        external_listing_id: result.externalListingId,
        sync_status: result.syncStatus,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "item_id,connector_key" }
    );

    if (error) {
      return { error: error.message };
    }

    revalidatePath(`/items/${itemId}`);
    revalidatePath("/items");
    revalidatePath("/dashboard");
    return { success: true, status: result.syncStatus };
  } catch (err) {
    await supabase.from("channel_listings").upsert(
      {
        item_id: itemId,
        connector_key: connectorKey,
        sync_status: "sync_error",
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "item_id,connector_key" }
    );
    revalidatePath(`/items/${itemId}`);
    return {
      error: err instanceof Error ? err.message : "Publish failed.",
    };
  }
}

export async function updateOnChannel(itemId: string, connectorKey: string) {
  const loaded = await loadMasterItem(itemId);
  if ("error" in loaded && loaded.error) {
    return { error: loaded.error };
  }

  const { supabase, masterItem } = loaded as {
    supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
    masterItem: MasterItem;
  };

  const connector = getMarketplaceConnector(connectorKey);
  if (!connector) {
    return { error: "Sales channel connector not found." };
  }

  const { data: listing } = await supabase
    .from("channel_listings")
    .select("*")
    .eq("item_id", itemId)
    .eq("connector_key", connectorKey)
    .maybeSingle();

  try {
    const result = await connector.updateListing(
      listing?.external_listing_id ?? itemId,
      masterItem
    );

    const { error } = await supabase
      .from("channel_listings")
      .update({
        external_listing_id: result.externalListingId,
        sync_status: result.syncStatus,
        last_synced_at: new Date().toISOString(),
      })
      .eq("item_id", itemId)
      .eq("connector_key", connectorKey);

    if (error) {
      return { error: error.message };
    }

    revalidatePath(`/items/${itemId}`);
    revalidatePath("/items");
    revalidatePath("/dashboard");
    return { success: true, status: result.syncStatus };
  } catch (err) {
    await supabase
      .from("channel_listings")
      .update({
        sync_status: "sync_error",
        last_synced_at: new Date().toISOString(),
      })
      .eq("item_id", itemId)
      .eq("connector_key", connectorKey);

    revalidatePath(`/items/${itemId}`);
    return {
      error: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

export async function unpublishFromChannel(
  itemId: string,
  connectorKey: string
) {
  const { supabase } = await requireUser();

  const connector = getMarketplaceConnector(connectorKey);
  if (!connector) {
    return { error: "Sales channel connector not found." };
  }

  const { data: listing } = await supabase
    .from("channel_listings")
    .select("*")
    .eq("item_id", itemId)
    .eq("connector_key", connectorKey)
    .maybeSingle();

  try {
    await connector.unpublishListing(listing?.external_listing_id ?? itemId);

    const { error } = await supabase
      .from("channel_listings")
      .update({
        sync_status: "not_published",
        external_listing_id: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("item_id", itemId)
      .eq("connector_key", connectorKey);

    if (error) {
      return { error: error.message };
    }

    revalidatePath(`/items/${itemId}`);
    revalidatePath("/items");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Unpublish failed.",
    };
  }
}
