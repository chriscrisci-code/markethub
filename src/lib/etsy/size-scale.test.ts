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
        { value_id: 10, name: "S" },
        { value_id: 11, name: "M" },
        { value_id: 12, name: "L" },
        { value_id: 13, name: "4XL" },
      ],
    },
    {
      scale_id: 2,
      display_name: "Alpha",
      values: [
        { value_id: 20, name: "XS" },
        { value_id: 21, name: "S" },
        { value_id: 22, name: "M" },
        { value_id: 23, name: "L" },
        { value_id: 24, name: "2XL" },
        { value_id: 25, name: "4XL" },
      ],
    },
  ],
};

for (const size of ["S", "M", "L", "4XL"]) {
  const resolved = resolveVariationValue(sizeProperty, size);
  assert.equal(resolved.scaleId, 2, size);
  assert.ok((resolved.valueId ?? 0) >= 20, size);
}

console.log("adult size scale checks passed");
