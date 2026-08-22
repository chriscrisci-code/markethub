import {
  marketHubStoreConnector,
  mockMarketplaceConnector,
} from "./mock";
import type { ChannelStatus, MarketplaceConnector } from "./types";
import type { ChannelListing, ConnectorRegistry } from "@/lib/types/database";

const marketplaceConnectors: Record<string, MarketplaceConnector> = {
  [mockMarketplaceConnector.key]: mockMarketplaceConnector,
  [marketHubStoreConnector.key]: marketHubStoreConnector,
};

export function getMarketplaceConnector(
  key: string
): MarketplaceConnector | null {
  return marketplaceConnectors[key] ?? null;
}

export function listMarketplaceConnectors(): MarketplaceConnector[] {
  return Object.values(marketplaceConnectors);
}

export function registerMarketplaceConnector(connector: MarketplaceConnector) {
  marketplaceConnectors[connector.key] = connector;
}

export function getChannelStatuses(
  marketplaces: ConnectorRegistry[],
  listings: ChannelListing[]
): ChannelStatus[] {
  return marketplaces.map((marketplace) => {
    const listing = listings.find((l) => l.connector_key === marketplace.key);
    const syncStatus = listing?.sync_status ?? "not_published";

    return {
      connectorKey: marketplace.key,
      displayName: marketplace.display_name,
      syncStatus,
      canPublish: syncStatus === "not_published",
      canUpdate: syncStatus === "published",
    };
  });
}
