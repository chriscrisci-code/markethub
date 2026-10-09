import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptJson, isEncryptedPayload, type EtsyTokenBundle } from "@/lib/etsy/tokens";
import { etsyConfig, getValidEtsyAccessToken } from "@/lib/etsy/oauth";
import {
  createOrUpdateDraftListing,
  dollarsFromCents,
  getListingImageIds,
  getListingState,
  getShirtTaxonomyId,
  getShopReadinessStateId,
  getShopShippingProfileId,
  getVariationProperties,
  resolveVariationValue,
  updateListingInventory,
  updateVariationImages,
  uploadListingImage,
  type ResolvedVariation,
} from "@/lib/etsy/shop-listing";

type PublishResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

type VariantRow = {
  id: string;
  sku: string | null;
  provider_catalog_variant_id: string | null;
  attributes: { color?: string; size?: string } | null;
};

type MockupRow = {
  id: string;
  color_name: string | null;
  mapping_status: string | null;
  storage_path: string | null;
  created_at: string;
};

function numericListingId(value: string | null | undefined): value is string {
  return Boolean(value && /^\d+$/.test(value));
}

function attribute(variant: VariantRow, key: "color" | "size") {
  const value = variant.attributes?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function fail(status: number, error: string, extra: Record<string, unknown> = {}): PublishResult {
  return { ok: false, status, body: { error, ...extra } };
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

  if (!item) return fail(404, "Item not found.");

  const { data: connection } = await supabase
    .from("connector_connections")
    .select("id, external_account_id, status")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("connector_key", "etsy")
    .maybeSingle();

  if (!connection || connection.status !== "connected") {
    return fail(400, "Connect this Etsy shop before publishing a draft.");
  }

  if (!numericListingId(connection.external_account_id)) {
    return fail(400, "This storefront does not have an Etsy shop id yet.");
  }
  const shopId = connection.external_account_id;

  const service = createServiceClient();
  if (!service) return fail(500, "Server is missing SUPABASE_SERVICE_ROLE_KEY.");

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
    return fail(
      409,
      "Reconnect Etsy on the Storefronts page. The current connection can see the shop, but it cannot create listings yet.",
      { code: "reconnect_required" }
    );
  }

  const { data: variants, error: variantError } = await supabase
    .from("item_variants")
    .select("id, sku, provider_catalog_variant_id, attributes")
    .eq("item_id", itemId);

  if (variantError) return fail(500, variantError.message);

  const mapped = ((variants ?? []) as VariantRow[]).filter(
    (variant) => variant.provider_catalog_variant_id && variant.sku && attribute(variant, "color") && attribute(variant, "size")
  );

  const { data: mockups, error: mockupError } = await supabase
    .from("item_mockups")
    .select("id, color_name, mapping_status, storage_path, created_at")
    .eq("item_id", itemId);

  if (mockupError) return fail(500, mockupError.message);

  const problems: string[] = [];
  if (!item.name || item.name === "Untitled Item") problems.push("Give the item a title.");
  if (!item.description?.trim()) problems.push("Add a description.");
  if (!item.base_price_cents || item.base_price_cents <= 0) {
    problems.push("Set a sale price above zero.");
  }
  if (mapped.length === 0) {
    problems.push("No Printful sizes are mapped. Re-save a mockup for each color.");
  }
  const mockupRows = (mockups ?? []) as MockupRow[];
  const mappedColors = new Set(mapped.map((variant) => attribute(variant, "color").toLowerCase()));
  const unresolved = mockupRows.filter((mockup) => {
    const color = mockup.color_name?.trim().toLowerCase();
    return !color || !mappedColors.has(color);
  });
  if (mockupRows.length === 0) problems.push("Save at least one mockup image.");
  if (unresolved.length > 0) {
    const names = unresolved
      .map((mockup) => mockup.color_name?.trim())
      .filter((name): name is string => Boolean(name));
    problems.push(
      names.length > 0
        ? `Re-save the mockup for ${names.join(", ")} so Printful sizes are mapped.`
        : "Re-save each mockup. A saved image is missing its color."
    );
  }
  if (problems.length > 0) {
    return fail(400, problems.join(" "), { code: "validation_needed", problems });
  }

  const { data: existingListing } = await supabase
    .from("channel_listings")
    .select("id, external_listing_id, publication_state, updated_at")
    .eq("item_id", itemId)
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (
    existingListing?.publication_state === "publishing" &&
    existingListing.updated_at &&
    Date.now() - new Date(existingListing.updated_at).getTime() < 90_000
  ) {
    return fail(409, "This draft is already being sent. Wait a moment, then try again.");
  }

  const existingListingId = numericListingId(existingListing?.external_listing_id)
    ? existingListing.external_listing_id
    : null;

  const { error: lockError } = await supabase.from("channel_listings").upsert(
    {
      item_id: itemId,
      connector_key: "etsy",
      connection_id: connectionId,
      external_listing_id: existingListingId,
      sync_status: "sync_pending",
      publication_state: "publishing",
      sync_error: null,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "item_id,connection_id" }
  );
  if (lockError) {
    const message = lockError.message.includes("publication_state")
      ? "Market Hub cannot save an Etsy draft yet. The latest database update still needs to be applied."
      : lockError.message;
    return fail(500, message);
  }

  const config = etsyConfig();
  if ("error" in config) return fail(500, "Etsy is not configured on the server.");

  const token = await getValidEtsyAccessToken(connectionId, userId);
  if ("error" in token) return fail(401, token.error);

  const shipping = await getShopShippingProfileId(config, token.accessToken, shopId);
  if (!shipping.ok) return await rememberFailure(supabase, itemId, connectionId, existingListingId, shipping.error);

  const readiness = await getShopReadinessStateId(config, token.accessToken, shopId);
  if (!readiness.ok) return await rememberFailure(supabase, itemId, connectionId, existingListingId, readiness.error);

  const taxonomy = await getShirtTaxonomyId(config, token.accessToken);
  if (!taxonomy.ok) return await rememberFailure(supabase, itemId, connectionId, existingListingId, taxonomy.error);

  const properties = await getVariationProperties(config, token.accessToken, taxonomy.data);
  if (!properties.ok) return await rememberFailure(supabase, itemId, connectionId, existingListingId, properties.error);

  const price = dollarsFromCents(item.base_price_cents);
  const description = item.description?.trim() ?? "";
  const draft = await createOrUpdateDraftListing({
    config,
    accessToken: token.accessToken,
    shopId,
    listingId: existingListingId,
    title: item.name,
    description,
    price,
    taxonomyId: taxonomy.data,
    shippingProfileId: shipping.data,
    readinessStateId: readiness.data,
  });
  if (!draft.ok) {
    return await rememberFailure(supabase, itemId, connectionId, existingListingId, draft.error);
  }

  const listingId = draft.data.listingId;
  await supabase
    .from("channel_listings")
    .update({
      external_listing_id: listingId,
      listing_url: draft.data.listingUrl,
      publication_state: "partially_synchronized",
      sync_status: "sync_pending",
    })
    .eq("item_id", itemId)
    .eq("connection_id", connectionId);

  const imagesByColor = new Map<string, MockupRow>();
  for (const mockup of mockupRows) {
    if (!mockup.color_name || !mockup.storage_path) continue;
    const key = mockup.color_name.toLowerCase();
    const current = imagesByColor.get(key);
    if (!current || mockup.created_at > current.created_at) imagesByColor.set(key, mockup);
  }
  const colorImages = [...imagesByColor.values()].sort((a, b) =>
    (a.color_name ?? "").localeCompare(b.color_name ?? "")
  );

  const uploaded = new Map<string, number>();
  const existingImages = await getListingImageIds(config, token.accessToken, shopId, listingId);
  const alreadyUploaded = existingImages.ok ? existingImages.data : [];
  for (const [index, mockup] of colorImages.entries()) {
    const existingId = alreadyUploaded[index];
    if (existingId && mockup.color_name) {
      uploaded.set(mockup.color_name.toLowerCase(), existingId);
      continue;
    }
    const downloaded = await supabase.storage.from("mockups").download(mockup.storage_path!);
    if (downloaded.error || !downloaded.data) {
      return await rememberFailure(
        supabase,
        itemId,
        connectionId,
        listingId,
        `Etsy draft ${listingId} was saved, but the ${mockup.color_name} image could not be read. Try again.`
      );
    }
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const image = await uploadListingImage({
      config,
      accessToken: token.accessToken,
      shopId,
      listingId,
      filename: `${mockup.color_name ?? "mockup"}.jpg`,
      bytes,
      rank: index + 1,
    });
    if (!image.ok) {
      return await rememberFailure(
        supabase,
        itemId,
        connectionId,
        listingId,
        `Etsy draft ${listingId} was saved, but the ${mockup.color_name} image was not uploaded. ${image.error}`
      );
    }
    uploaded.set((mockup.color_name ?? "").toLowerCase(), image.data);
  }

  const products = mapped.map((variant) => {
    const color = resolveVariationValue(properties.data.color, attribute(variant, "color"));
    const size = resolveVariationValue(properties.data.size, attribute(variant, "size"));
    return {
      variant,
      color,
      size,
      product: {
        sku: variant.sku!,
        property_values: [propertyValue(color), propertyValue(size)],
        offerings: [
          {
            price,
            quantity: 999,
            is_enabled: true,
            readiness_state_id: readiness.data,
          },
        ],
      },
    };
  });

  const inventory = await updateListingInventory({
    config,
    accessToken: token.accessToken,
    listingId,
    products: products.map((entry) => entry.product),
    skuOnProperty: [properties.data.color.property_id, properties.data.size.property_id],
  });
  if (!inventory.ok) {
    return await rememberFailure(
      supabase,
      itemId,
      connectionId,
      listingId,
      `Etsy draft ${listingId} was saved, but the sizes were not attached. ${inventory.error}`
    );
  }

  const variationImages: Array<{ property_id: number; value_id: number; image_id: number }> = [];
  const warnings: string[] = [];
  for (const entry of products) {
    const imageId = uploaded.get(attribute(entry.variant, "color").toLowerCase());
    const returned = inventory.data.find((product) => product.sku === entry.variant.sku);
    const colorValue = returned?.property_values?.find(
      (value) => (value as { property_id?: number }).property_id === properties.data.color.property_id
    );
    const valueId = colorValue?.value_ids?.[0] ?? entry.color.valueId;
    if (!imageId || !valueId) {
      const message = `${attribute(entry.variant, "color")} image was not linked to its color.`;
      if (!warnings.includes(message)) warnings.push(message);
      continue;
    }
    if (!variationImages.some((image) => image.value_id === valueId)) {
      variationImages.push({
        property_id: properties.data.color.property_id,
        value_id: valueId,
        image_id: imageId,
      });
    }
  }

  if (variationImages.length > 0) {
    const linked = await updateVariationImages({
      config,
      accessToken: token.accessToken,
      shopId,
      listingId,
      images: variationImages,
    });
    if (!linked.ok) warnings.push(`Color photos were uploaded, but Etsy did not attach them: ${linked.error}`);
  }

  const confirmed = await getListingState(config, token.accessToken, shopId, listingId);
  if (!confirmed.ok) {
    return await rememberFailure(
      supabase,
      itemId,
      connectionId,
      listingId,
      `Etsy draft ${listingId} was saved, but Market Hub could not confirm it. ${confirmed.error}`
    );
  }
  if (confirmed.data.state === "active") {
    return await rememberFailure(
      supabase,
      itemId,
      connectionId,
      listingId,
      `Etsy listing ${listingId} is already live. Market Hub did not change it to active.`
    );
  }

  const listingUrl =
    confirmed.data.url ||
    draft.data.listingUrl ||
    `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`;
  const publicationState = warnings.length > 0 ? "partially_synchronized" : "draft_ready";

  const { data: savedListing } = await supabase
    .from("channel_listings")
    .update({
      external_listing_id: listingId,
      listing_url: listingUrl,
      publication_state: publicationState,
      sync_status: "sync_pending",
      sync_error: warnings.length > 0 ? warnings.join(" ") : null,
      last_synced_at: new Date().toISOString(),
    })
    .eq("item_id", itemId)
    .eq("connection_id", connectionId)
    .select("id")
    .maybeSingle();

  if (savedListing?.id) {
    await supabase.from("listing_variant_mappings").delete().eq("channel_listing_id", savedListing.id);
    const rows = products.map((entry) => {
      const returned = inventory.data.find((product) => product.sku === entry.variant.sku);
      return {
        channel_listing_id: savedListing.id,
        item_variant_id: entry.variant.id,
        provider_catalog_variant_id: entry.variant.provider_catalog_variant_id,
        sku: entry.variant.sku,
        external_product_id: returned?.product_id ? String(returned.product_id) : null,
        external_offering_id: returned?.offerings?.[0]?.offering_id
          ? String(returned.offerings[0].offering_id)
          : null,
      };
    });
    await supabase.from("listing_variant_mappings").insert(rows);
  }

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      listingId,
      listingUrl,
      publicationState,
      draft: true,
      variantCount: mapped.length,
      imageCount: uploaded.size,
      warning: warnings.length > 0 ? warnings.join(" ") : undefined,
    },
  };
}

function propertyValue(resolved: ResolvedVariation) {
  return {
    property_id: resolved.propertyId,
    property_name: resolved.propertyName,
    ...(resolved.scaleId ? { scale_id: resolved.scaleId } : {}),
    ...(resolved.valueId ? { value_ids: [resolved.valueId] } : {}),
    values: [resolved.value.replace(/[()]/g, "")],
  };
}

async function rememberFailure(
  supabase: SupabaseClient,
  itemId: string,
  connectionId: string,
  listingId: string | null | undefined,
  error: string
): Promise<PublishResult> {
  await supabase
    .from("channel_listings")
    .update({
      external_listing_id: listingId ?? null,
      publication_state: listingId ? "partially_synchronized" : "update_failed",
      sync_status: "sync_error",
      sync_error: error,
    })
    .eq("item_id", itemId)
    .eq("connection_id", connectionId);

  return fail(502, error, {
    listingId: listingId ?? null,
    code: listingId ? "partial" : "etsy_error",
  });
}
