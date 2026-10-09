import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptJson, isEncryptedPayload, type EtsyTokenBundle } from "@/lib/etsy/tokens";
import { etsyConfig, getValidEtsyAccessToken } from "@/lib/etsy/oauth";

export function liveEtsyWritesEnabled() {
  return process.env.ETSY_LIVE_WRITES === "true";
}

type PublishResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

function numericListingId(value: string | null | undefined) {
  return Boolean(value && /^\d+$/.test(value));
}

export async function publishEtsyDraft(input: {
  supabase: SupabaseClient;
  userId: string;
  itemId: string;
  connectionId: string;
}): Promise<PublishResult> {
  const { supabase, userId, itemId, connectionId } = input;

  const { data: item } = await supabase
    .from("items")
    .select("id, name, description, base_price_cents")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!item) {
    return { ok: false, status: 404, body: { error: "Item not found." } };
  }

  const { data: connection } = await supabase
    .from("connector_connections")
    .select("id, external_account_id, status")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("connector_key", "etsy")
    .maybeSingle();

  if (!connection || connection.status !== "connected") {
    return {
      ok: false,
      status: 400,
      body: { error: "Connect this Etsy shop before publishing a draft." },
    };
  }

  if (!numericListingId(connection.external_account_id)) {
    return {
      ok: false,
      status: 400,
      body: { error: "This storefront does not have an Etsy shop id yet." },
    };
  }

  const service = createServiceClient();
  if (!service) {
    return {
      ok: false,
      status: 500,
      body: { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
    };
  }

  const { data: secretRow } = await service
    .from("connector_connections")
    .select("credentials")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();

  let scope = "";
  if (secretRow && isEncryptedPayload(secretRow.credentials)) {
    try {
      scope = decryptJson<EtsyTokenBundle>(secretRow.credentials).scope ?? "";
    } catch {
      scope = "";
    }
  }

  if (!scope.includes("listings_w")) {
    return {
      ok: false,
      status: 409,
      body: {
        error:
          "Reconnect Etsy on the Storefronts page. The current connection can see the shop, but it cannot create listings yet.",
        code: "reconnect_required",
      },
    };
  }

  const { data: variants } = await supabase
    .from("item_variants")
    .select("id, sku, label, provider_catalog_variant_id, attributes")
    .eq("item_id", itemId);

  const mapped = (variants ?? []).filter(
    (variant) => variant.provider_catalog_variant_id && variant.sku
  );
  const { data: mockups } = await supabase
    .from("item_mockups")
    .select("id, color_name, mapping_status, storage_path")
    .eq("item_id", itemId);

  const problems: string[] = [];
  if (!item.name || item.name === "Untitled Item") {
    problems.push("Give the item a title.");
  }
  if (!item.description?.trim()) {
    problems.push("Add a description.");
  }
  if (!item.base_price_cents || item.base_price_cents <= 0) {
    problems.push("Set a sale price above zero.");
  }
  if (mapped.length === 0) {
    problems.push(
      "No Printful size variants are mapped. Re-save a mockup for each color after the variant migration is applied."
    );
  }
  const unresolved = (mockups ?? []).filter(
    (mockup) => mockup.mapping_status === "needs_resolution"
  );
  if ((mockups ?? []).length === 0) {
    problems.push("Save at least one mockup image.");
  }
  if (unresolved.length > 0) {
    problems.push(
      `${unresolved.length} saved image(s) still need a Printful variant mapping.`
    );
  }

  if (problems.length > 0) {
    return {
      ok: false,
      status: 400,
      body: { error: problems.join(" "), code: "validation_needed", problems },
    };
  }

  if (!liveEtsyWritesEnabled()) {
    return {
      ok: false,
      status: 409,
      body: {
        error:
          "The draft is ready to send, but live Etsy writes are off. Approve the first draft before Market Hub creates it.",
        code: "approval_required",
        shopId: connection.external_account_id,
        title: item.name,
        variantCount: mapped.length,
        imageCount: (mockups ?? []).length,
      },
    };
  }

  const config = etsyConfig();
  if ("error" in config) {
    return { ok: false, status: 500, body: { error: "Etsy is not configured on the server." } };
  }

  const token = await getValidEtsyAccessToken(connectionId, userId);
  if ("error" in token) {
    return { ok: false, status: 401, body: { error: token.error } };
  }

  return {
    ok: false,
    status: 501,
    body: {
      error:
        "Live Etsy writes were approved in configuration, but the draft request is still held until the listing payload is confirmed against this shop's shipping profile and taxonomy.",
      code: "held",
    },
  };
}
