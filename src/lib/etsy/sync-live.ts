import type { SupabaseClient } from "@supabase/supabase-js";
import { etsyConfig, getValidEtsyAccessToken } from "@/lib/etsy/oauth";
import {
  etsyPublicListingUrl,
  listActiveShopListings,
} from "@/lib/etsy/shop-listing";

/** Read each connected shop's active listings and mark the matching rows published. */
export async function syncEtsyLiveListings(supabase: SupabaseClient) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const config = etsyConfig();
    if ("error" in config) return;

    const { data: connections } = await supabase
      .from("connector_connections")
      .select("id, external_account_id")
      .eq("user_id", user.id)
      .eq("connector_key", "etsy")
      .eq("status", "connected");

    for (const connection of connections ?? []) {
      const shopId = connection.external_account_id as string | null;
      if (!shopId || !/^\d+$/.test(shopId)) continue;

      const token = await getValidEtsyAccessToken(connection.id, user.id);
      if ("error" in token) continue;

      const active = await listActiveShopListings(config, token.accessToken, shopId);
      if (!active.ok) continue;

      for (const listing of active.data) {
        const listingId =
          listing.listing_id != null ? String(listing.listing_id) : "";
        if (!/^\d+$/.test(listingId)) continue;

        await supabase
          .from("channel_listings")
          .update({
            sync_status: "published",
            publication_state: "live",
            listing_url: etsyPublicListingUrl(listingId, listing.url),
            sync_error: null,
            last_synced_at: new Date().toISOString(),
          })
          .eq("connection_id", connection.id)
          .eq("connector_key", "etsy")
          .eq("external_listing_id", listingId);
      }
    }
  } catch (error) {
    console.error(
      "syncEtsyLiveListings:",
      error instanceof Error ? error.message : error
    );
  }
}
