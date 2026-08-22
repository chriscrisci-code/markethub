export type OrderStatus =
  | "pending"
  | "processing"
  | "fulfilled"
  | "cancelled"
  | "refunded";

export type CostType =
  | "marketplace_fee"
  | "fulfillment_expected"
  | "fulfillment_confirmed"
  | "refund"
  | "other";

export interface Order {
  id: string;
  user_id: string;
  market_hub_order_number: number;
  source_connector_key: string | null;
  external_order_id: string | null;
  customer: {
    name?: string;
    email?: string;
  };
  shipping: {
    line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  status: OrderStatus;
  sale_amount_cents: number;
  created_at: string;
  updated_at: string;
}

export interface OrderLineItem {
  id: string;
  order_id: string;
  item_id: string | null;
  variant_id: string | null;
  label: string;
  quantity: number;
  unit_price_cents: number;
}

export interface FulfillmentJob {
  id: string;
  order_id: string;
  provider_key: string | null;
  external_job_id: string | null;
  status: string;
  tracking: {
    carrier?: string;
    trackingNumber?: string;
  };
}

export interface OrderCost {
  id: string;
  order_id: string;
  cost_type: CostType;
  label: string;
  amount_cents: number;
  is_confirmed: boolean;
}

export interface OrderWithRelations extends Order {
  order_line_items: OrderLineItem[];
  fulfillment_jobs: FulfillmentJob[];
  order_costs: OrderCost[];
  source_connector?: { display_name: string } | null;
}

export interface ProfitBreakdown {
  revenueCents: number;
  marketplaceFeesCents: number;
  fulfillmentExpectedCents: number;
  fulfillmentConfirmedCents: number;
  otherCostsCents: number;
  estimatedProfitCents: number;
  usingConfirmedFulfillment: boolean;
}
