import assert from "node:assert/strict";
import {
  purchasableCatalogVariants,
  stableSku,
} from "./combinations.ts";

const variants = [
  { catalogVariantId: "1", colorName: "Heather Olive", sizeName: "S", inStock: true },
  { catalogVariantId: "2", colorName: "Heather Olive", sizeName: "M", inStock: true },
  { catalogVariantId: "3", colorName: "Heather Olive", sizeName: "L", inStock: false },
  { catalogVariantId: "4", colorName: "Black Heather", sizeName: "M", inStock: true },
  { catalogVariantId: "", colorName: "Heather Olive", sizeName: "XL", inStock: true },
];

const olive = purchasableCatalogVariants(variants, "heather olive");
assert.deepEqual(
  olive.map((variant) => variant.catalogVariantId),
  ["1", "2"]
);
assert.equal(stableSku("abcdef12-3456-7890-abcd-ef1234567890", "4012"), "MH-abcdef12-4012");

console.log("variant combination checks passed");
