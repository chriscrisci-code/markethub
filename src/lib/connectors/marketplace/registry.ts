import {
  etsyConnector,
  marketHubStoreConnector,
  mockMarketplaceConnector,
} from "./mock";
import type { ChannelStatus, MarketplaceConnector } from "./types";
import type { ChannelListing, ConnectorRegistry } from "@/lib/types/database";

const marketplaceConnectors: Record<string, MarketplaceConnector> = {
  [mockMarketplaceConnector.key]: mockMarketplaceConnector,
  [marketHubStoreConnector.key]: marketHubStoreConnector,
  [etsyConnector.key]: etsyConnector,
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

export interface StorefrontConnection {
  id: string;
  connector_key: string;
  display_name: string;
  status: string;
}

export function getChannelStatuses(
  storefronts: StorefrontConnection[],
  listings: ChannelListing[],
  platforms: ConnectorRegistry[]
): ChannelStatus[] {
  return storefronts.map((storefront) => {
    const listing = listings.find((l) => l.connection_id === storefront.id);
    const syncStatus = listing?.sync_status ?? "not_published";
    const platform = platforms.find((p) => p.key === storefront.connector_key);

    return {
      connectionId: storefront.id,
      connectorKey: storefront.connector_key,
      displayName: storefront.display_name,
      platformName: platform?.display_name ?? storefront.connector_key,
      syncStatus,
      canPublish:
        syncStatus === "not_published" || syncStatus === "sync_error",
      canUpdate: syncStatus === "published",
    };
  });
}
