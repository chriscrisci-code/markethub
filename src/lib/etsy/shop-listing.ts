import type { EtsyConfig } from "@/lib/etsy/oauth";

const ETSY_API = "https://openapi.etsy.com/v3/application";

export type EtsyCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

type TaxonomyNode = {
  id: number;
  name: string;
  children?: TaxonomyNode[];
};

type TaxonomyValue = { value_id: number; name: string };

type TaxonomyProperty = {
  property_id: number;
  name: string;
  display_name?: string;
  supports_variations?: boolean;
  possible_values?: TaxonomyValue[];
  scales?: Array<{
    scale_id: number;
    display_name?: string;
    values?: TaxonomyValue[];
  }>;
};

export type ResolvedVariation = {
  propertyId: number;
  propertyName: string;
  scaleId?: number;
  valueId?: number;
  value: string;
};

function headers(config: EtsyConfig, accessToken: string, json = false) {
  return {
    "x-api-key": `${config.keystring}:${config.sharedSecret}`,
    Authorization: `Bearer ${accessToken}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function readError(response: Response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: string; message?: string };
    return body.error || body.message || text.slice(0, 400);
  } catch {
    return text.slice(0, 400) || `Etsy returned ${response.status}.`;
  }
}

async function etsyGet<T>(
  config: EtsyConfig,
  accessToken: string,
  path: string
): Promise<EtsyCallResult<T>> {
  const response = await fetch(`${ETSY_API}${path}`, {
    headers: headers(config, accessToken),
  });
  if (!response.ok) {
    return { ok: false, status: response.status, error: await readError(response) };
  }
  return { ok: true, data: (await response.json()) as T };
}

export function dollarsFromCents(cents: number) {
  return Math.round(cents) / 100;
}

export async function getShopShippingProfileId(
  config: EtsyConfig,
  accessToken: string,
  shopId: string
) {
  const result = await etsyGet<{
    results?: Array<{ shipping_profile_id?: number }>;
  }>(config, accessToken, `/shops/${shopId}/shipping-profiles`);
  if (!result.ok) return result;
  const profileId = result.data.results?.find((row) => row.shipping_profile_id)
    ?.shipping_profile_id;
  if (!profileId) {
    return {
      ok: false as const,
      status: 400,
      error:
        "This Etsy shop has no shipping profile. Create one in Etsy, then publish the draft again.",
    };
  }
  return { ok: true as const, data: profileId };
}

export async function getShopReadinessStateId(
  config: EtsyConfig,
  accessToken: string,
  shopId: string
) {
  const result = await etsyGet<{
    results?: Array<{ readiness_state_id?: number }>;
  }>(config, accessToken, `/shops/${shopId}/readiness-state-definitions`);
  if (!result.ok) return result;
  const readinessId = result.data.results?.find((row) => row.readiness_state_id)
    ?.readiness_state_id;
  if (!readinessId) {
    return {
      ok: false as const,
      status: 400,
      error:
        "This Etsy shop has no processing profile. Create one in Etsy, then publish the draft again.",
    };
  }
  return { ok: true as const, data: readinessId };
}

function findShirtTaxonomyId(nodes: TaxonomyNode[]): number | null {
  let fallback: number | null = null;
  const walk = (list: TaxonomyNode[]): number | null => {
    for (const node of list) {
      const name = node.name.toLowerCase();
      if (name === "t-shirts") return node.id;
      if (fallback == null && name.includes("t-shirt")) fallback = node.id;
      if (node.children?.length) {
        const found = walk(node.children);
        if (found != null) return found;
      }
    }
    return null;
  };
  return walk(nodes) ?? fallback;
}

export async function getShirtTaxonomyId(
  config: EtsyConfig,
  accessToken: string
) {
  const result = await etsyGet<{ results?: TaxonomyNode[] }>(
    config,
    accessToken,
    "/seller-taxonomy/nodes"
  );
  if (!result.ok) return result;
  const taxonomyId = findShirtTaxonomyId(result.data.results ?? []);
  if (!taxonomyId) {
    return {
      ok: false as const,
      status: 400,
      error: "Etsy did not return a T-shirt category.",
    };
  }
  return { ok: true as const, data: taxonomyId };
}

function propertyLabel(property: TaxonomyProperty) {
  return (property.display_name || property.name || "").toLowerCase();
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const SIZE_ALIASES: Record<string, string> = {
  s: "small",
  m: "medium",
  l: "large",
  xl: "x large",
  "2xl": "xx large",
  "3xl": "xxx large",
  "4xl": "xxxx large",
};

function matchValue(name: string, values: TaxonomyValue[]) {
  const wanted = normalizeName(name);
  const alias = SIZE_ALIASES[wanted.replace(/\s/g, "")] ?? wanted;
  return values.find((value) => {
    const candidate = normalizeName(value.name);
    return candidate === wanted || candidate === alias;
  });
}

export async function getVariationProperties(
  config: EtsyConfig,
  accessToken: string,
  taxonomyId: number
) {
  const result = await etsyGet<{ results?: TaxonomyProperty[] }>(
    config,
    accessToken,
    `/seller-taxonomy/nodes/${taxonomyId}/properties`
  );
  if (!result.ok) return result;
  const properties = (result.data.results ?? []).filter(
    (property) => property.supports_variations !== false
  );
  const color = properties.find((property) => propertyLabel(property).includes("color"));
  const size = properties.find((property) => {
    const label = propertyLabel(property);
    return label === "size" || label.endsWith(" size");
  });
  if (!color || !size) {
    return {
      ok: false as const,
      status: 400,
      error: "Etsy did not return color and size variations for the T-shirt category.",
    };
  }
  return { ok: true as const, data: { color, size } };
}

export function resolveVariationValue(
  property: TaxonomyProperty,
  name: string
): ResolvedVariation {
  const values = [
    ...(property.possible_values ?? []),
    ...(property.scales ?? []).flatMap((scale) => scale.values ?? []),
  ];
  const matched = matchValue(name, values);
  if (!matched) {
    return {
      propertyId: property.property_id,
      propertyName: property.display_name || property.name,
      value: name,
    };
  }
  const scale = property.scales?.find((entry) =>
    entry.values?.some((value) => value.value_id === matched.value_id)
  );
  return {
    propertyId: property.property_id,
    propertyName: property.display_name || property.name,
    scaleId: scale?.scale_id,
    valueId: matched.value_id,
    value: matched.name,
  };
}

export async function createOrUpdateDraftListing(input: {
  config: EtsyConfig;
  accessToken: string;
  shopId: string;
  listingId?: string | null;
  title: string;
  description: string;
  price: number;
  taxonomyId: number;
  shippingProfileId: number;
  readinessStateId: number;
}) {
  const fields = new URLSearchParams({
    quantity: "999",
    title: input.title.slice(0, 140),
    description: input.description,
    price: input.price.toFixed(2),
    who_made: "someone_else",
    when_made: "made_to_order",
    taxonomy_id: String(input.taxonomyId),
    shipping_profile_id: String(input.shippingProfileId),
    readiness_state_id: String(input.readinessStateId),
    type: "physical",
  });

  const path = input.listingId
    ? `/shops/${input.shopId}/listings/${input.listingId}`
    : `/shops/${input.shopId}/listings`;
  const response = await fetch(`${ETSY_API}${path}`, {
    method: input.listingId ? "PATCH" : "POST",
    headers: {
      ...headers(input.config, input.accessToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: fields,
  });
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: await readError(response) };
  }
  const data = (await response.json()) as { listing_id?: number; url?: string };
  if (!data.listing_id) {
    return { ok: false as const, status: 502, error: "Etsy did not return a listing id." };
  }
  return {
    ok: true as const,
    data: {
      listingId: String(data.listing_id),
      listingUrl:
        data.url ||
        `https://www.etsy.com/your/shops/me/listing-editor/edit/${data.listing_id}`,
    },
  };
}

export async function uploadListingImage(input: {
  config: EtsyConfig;
  accessToken: string;
  shopId: string;
  listingId: string;
  filename: string;
  bytes: Buffer;
  rank: number;
}) {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.bytes)]);
  form.append("image", blob, input.filename);
  form.append("rank", String(input.rank));
  const response = await fetch(
    `${ETSY_API}/shops/${input.shopId}/listings/${input.listingId}/images`,
    {
      method: "POST",
      headers: headers(input.config, input.accessToken),
      body: form,
    }
  );
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: await readError(response) };
  }
  const data = (await response.json()) as { listing_image_id?: number };
  if (!data.listing_image_id) {
    return { ok: false as const, status: 502, error: "Etsy did not return an image id." };
  }
  return { ok: true as const, data: data.listing_image_id };
}

export async function getListingImageIds(
  config: EtsyConfig,
  accessToken: string,
  shopId: string,
  listingId: string
) {
  const result = await etsyGet<{
    results?: Array<{ listing_image_id?: number; rank?: number }>;
  }>(config, accessToken, `/shops/${shopId}/listings/${listingId}/images`);
  if (!result.ok) return result;
  const ids = (result.data.results ?? [])
    .slice()
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((image) => image.listing_image_id)
    .filter((id): id is number => Boolean(id));
  return { ok: true as const, data: ids };
}

type InventoryProduct = {
  sku: string;
  property_values: Array<{
    property_id: number;
    property_name: string;
    scale_id?: number;
    value_ids?: number[];
    values: string[];
  }>;
  offerings: Array<{
    price: number;
    quantity: number;
    is_enabled: boolean;
    readiness_state_id: number;
  }>;
};

export async function updateListingInventory(input: {
  config: EtsyConfig;
  accessToken: string;
  listingId: string;
  products: InventoryProduct[];
  skuOnProperty: number[];
}) {
  const response = await fetch(`${ETSY_API}/listings/${input.listingId}/inventory`, {
    method: "PUT",
    headers: headers(input.config, input.accessToken, true),
    body: JSON.stringify({
      products: input.products,
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: input.skuOnProperty,
    }),
  });
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: await readError(response) };
  }
  const data = (await response.json()) as {
    products?: Array<{
      product_id?: number;
      sku?: string;
      property_values?: Array<{ value_ids?: number[]; values?: string[] }>;
      offerings?: Array<{ offering_id?: number }>;
    }>;
  };
  return { ok: true as const, data: data.products ?? [] };
}

export async function updateVariationImages(input: {
  config: EtsyConfig;
  accessToken: string;
  shopId: string;
  listingId: string;
  images: Array<{ property_id: number; value_id: number; image_id: number }>;
}) {
  const response = await fetch(
    `${ETSY_API}/shops/${input.shopId}/listings/${input.listingId}/variation-images`,
    {
      method: "POST",
      headers: headers(input.config, input.accessToken, true),
      body: JSON.stringify({ variation_images: input.images }),
    }
  );
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: await readError(response) };
  }
  return { ok: true as const, data: true };
}

export async function getListingState(
  config: EtsyConfig,
  accessToken: string,
  shopId: string,
  listingId: string
) {
  return etsyGet<{ listing_id?: number; state?: string; url?: string }>(
    config,
    accessToken,
    `/shops/${shopId}/listings/${listingId}`
  );
}
