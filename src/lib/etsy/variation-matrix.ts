export type EtsyInventoryProduct = {
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

function variationKey(property: EtsyInventoryProduct["property_values"][number]) {
  const valueId = property.value_ids?.[0];
  return `${property.property_id}:${valueId ?? property.values[0]?.toLowerCase() ?? ""}`;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10) || "x";
}

function disabledSku(
  color: EtsyInventoryProduct["property_values"][number],
  size: EtsyInventoryProduct["property_values"][number],
  used: Set<string>
) {
  const raw = `NA-${slug(color.values[0] ?? "")}-${slug(size.values[0] ?? "")}`;
  let sku = raw.slice(0, 32);
  let suffix = 2;
  while (used.has(sku)) {
    const tail = `-${suffix}`;
    sku = `${raw.slice(0, 32 - tail.length)}${tail}`;
    suffix += 1;
  }
  return sku;
}

/**
 * Etsy rejects an inventory update unless every color is paired with every size
 * that appears on the listing. Pairs Printful does not sell are sent disabled.
 */
export function completeVariationMatrix(
  products: EtsyInventoryProduct[],
  price: number,
  readinessStateId: number
) {
  const colors = new Map<string, EtsyInventoryProduct["property_values"][number]>();
  const sizes = new Map<string, EtsyInventoryProduct["property_values"][number]>();
  const present = new Set<string>();
  const usedSkus = new Set(products.map((product) => product.sku));

  for (const product of products) {
    const [color, size] = product.property_values;
    if (!color || !size) continue;
    const colorKey = variationKey(color);
    const sizeKey = variationKey(size);
    colors.set(colorKey, color);
    sizes.set(sizeKey, size);
    present.add(`${colorKey}|${sizeKey}`);
  }

  const extras: EtsyInventoryProduct[] = [];
  for (const [colorKey, color] of colors) {
    for (const [sizeKey, size] of sizes) {
      if (present.has(`${colorKey}|${sizeKey}`)) continue;
      const sku = disabledSku(color, size, usedSkus);
      usedSkus.add(sku);
      extras.push({
        sku,
        property_values: [color, size],
        offerings: [
          {
            price,
            quantity: 1,
            is_enabled: false,
            readiness_state_id: readinessStateId,
          },
        ],
      });
    }
  }

  return [...products, ...extras];
}
