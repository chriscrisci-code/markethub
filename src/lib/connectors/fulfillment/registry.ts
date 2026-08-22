import { mockFulfillmentConnector } from "./mock";
import type { FulfillmentConnector } from "./types";

const fulfillmentConnectors: Record<string, FulfillmentConnector> = {
  [mockFulfillmentConnector.key]: mockFulfillmentConnector,
};

export function getFulfillmentConnector(key: string): FulfillmentConnector | null {
  return fulfillmentConnectors[key] ?? null;
}

export function listFulfillmentConnectors(): FulfillmentConnector[] {
  return Object.values(fulfillmentConnectors);
}

export function registerFulfillmentConnector(connector: FulfillmentConnector) {
  fulfillmentConnectors[connector.key] = connector;
}
