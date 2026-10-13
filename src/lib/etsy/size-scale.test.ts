import assert from "node:assert/strict";
import { resolveVariationValue } from "./shop-listing.ts";

const sizeProperty = {
  property_id: 513,
  name: "Size",
  scales: [
    {
      scale_id: 1,
      display_name: "US kids' letter",
      values: [
        { value_id: 9, name: "XS" },
        { value_id: 10, name: "S" },
        { value_id: 11, name: "M" },
        { value_id: 12, name: "L" },
        { value_id: 13, name: "2XL" },
        { value_id: 14, name: "3XL" },
        { value_id: 15, name: "4XL" },
      ],
    },
    {
      scale_id: 2,
      display_name: "US Letter",
      values: [
        { value_id: 20, name: "XS (US Letter)" },
        { value_id: 21, name: "S (US Letter)" },
        { value_id: 22, name: "M (US Letter)" },
        { value_id: 23, name: "L (US Letter)" },
        { value_id: 24, name: "2XL (US Letter)" },
        { value_id: 25, name: "3XL (US Letter)" },
        { value_id: 26, name: "4XL (US Letter)" },
      ],
    },
  ],
};

for (const size of ["XS", "S", "M", "L", "2XL", "3XL", "4XL"]) {
  const resolved = resolveVariationValue(sizeProperty, size);
  assert.equal(resolved.scaleId, 2, size);
  assert.ok((resolved.valueId ?? 0) >= 20, size);
  assert.equal(resolved.value.includes("kid"), false, size);
}

console.log("adult size scale checks passed");
