export type CatalogVariantInput = {
  catalogVariantId: string;
  colorName: string;
  sizeName: string;
  inStock: boolean;
};

/** In-stock color/size pairs from a provider catalog. Names are display only. */
export function purchasableCatalogVariants(
  variants: CatalogVariantInput[],
  colorName: string
) {
  const color = colorName.trim().toLowerCase();
  return variants.filter(
    (variant) =>
      variant.inStock &&
      variant.colorName.trim().toLowerCase() === color &&
      variant.sizeName.trim().length > 0 &&
      variant.catalogVariantId.trim().length > 0
  );
}

export function stableSku(itemId: string, catalogVariantId: string) {
  const compact = itemId.replace(/-/g, "").slice(0, 8);
  return `MH-${compact}-${catalogVariantId}`;
}

const APPAREL_SIZE_ORDER = ["xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl"];

export function sortApparelSizes(sizes: string[]) {
  const rank = (size: string) => {
    const key = size.toLowerCase().replace(/\s+/g, "");
    const index = APPAREL_SIZE_ORDER.indexOf(key);
    return index === -1 ? APPAREL_SIZE_ORDER.length : index;
  };
  return [...sizes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
