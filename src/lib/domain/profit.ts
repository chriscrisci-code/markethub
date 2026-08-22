import type { OrderCost, ProfitBreakdown } from "@/lib/types/orders";

/** Order-centric estimated profit. Costs are stored as positive cents. */
export function calculateOrderProfit(costs: OrderCost[], saleAmountCents: number): ProfitBreakdown {
  const marketplaceFeesCents = sumCosts(costs, "marketplace_fee");
  const fulfillmentExpectedCents = sumCosts(costs, "fulfillment_expected");
  const fulfillmentConfirmedCents = sumCosts(costs, "fulfillment_confirmed");
  const otherCostsCents =
    sumCosts(costs, "refund") + sumCosts(costs, "other");

  const usingConfirmedFulfillment = fulfillmentConfirmedCents > 0;
  const fulfillmentCents = usingConfirmedFulfillment
    ? fulfillmentConfirmedCents
    : fulfillmentExpectedCents;

  const estimatedProfitCents =
    saleAmountCents -
    marketplaceFeesCents -
    fulfillmentCents -
    otherCostsCents;

  return {
    revenueCents: saleAmountCents,
    marketplaceFeesCents,
    fulfillmentExpectedCents,
    fulfillmentConfirmedCents,
    otherCostsCents,
    estimatedProfitCents,
    usingConfirmedFulfillment,
  };
}

function sumCosts(costs: OrderCost[], type: OrderCost["cost_type"]) {
  return costs
    .filter((c) => c.cost_type === type)
    .reduce((sum, c) => sum + c.amount_cents, 0);
}
