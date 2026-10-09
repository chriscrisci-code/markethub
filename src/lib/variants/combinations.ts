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
