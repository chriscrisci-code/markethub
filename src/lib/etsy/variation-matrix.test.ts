import assert from "node:assert/strict";
import { completeVariationMatrix, type EtsyInventoryProduct } from "./variation-matrix.ts";

function product(sku: string, color: string, size: string): EtsyInventoryProduct {
  return {
    sku,
    property_values: [
      { property_id: 200, property_name: "Primary color", values: [color] },
      {
        property_id: 513,
        property_name: "Size",
        value_ids: [size === "5XL" ? 5 : 1],
        values: [size],
      },
    ],
    offerings: [
      { price: 28, quantity: 999, is_enabled: true, readiness_state_id: 9 },
    ],
  };
}

const products = [
  product("teal-m", "Heather Deep Teal", "M"),
  product("black-m", "Black Heather", "M"),
  product("black-5xl", "Black Heather", "5XL"),
];

const completed = completeVariationMatrix(products, 28, 9);
const teal5xl = completed.find(
  (entry) =>
    entry.property_values[0]?.values[0] === "Heather Deep Teal" &&
    entry.property_values[1]?.values[0] === "5XL"
);

assert.equal(completed.length, 4);
assert.equal(teal5xl?.offerings[0]?.is_enabled, false);
assert.equal(completed.filter((entry) => entry.offerings[0]?.is_enabled).length, 3);

console.log("etsy variation matrix checks passed");
