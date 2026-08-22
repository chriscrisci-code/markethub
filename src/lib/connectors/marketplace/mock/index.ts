import type { MarketplaceConnector } from "../types";

export const mockMarketplaceConnector: MarketplaceConnector = {
  key: "mock-marketplace",
  displayName: "Mock Marketplace",

  async connect(credentials) {
    return {
      externalAccountId: `mock-account-${JSON.stringify(credentials).length}`,
      status: "connected",
    };
  },

  async publishListing(item) {
    return {
      externalListingId: `mock-listing-${item.id.slice(0, 8)}`,
      syncStatus: "published",
    };
  },

  async updateListing(listingRef, item) {
    return {
      externalListingId: String(listingRef ?? item.id),
      syncStatus: "published",
    };
  },

  async unpublishListing() {
    return;
  },

  async importOrders() {
    return [];
  },
};

export const marketHubStoreConnector: MarketplaceConnector = {
  key: "market-hub-store",
  displayName: "Market Hub Store",

  async connect() {
    return { externalAccountId: "market-hub-store", status: "connected" };
  },

  async publishListing(item) {
    return {
      externalListingId: `hub-listing-${item.id.slice(0, 8)}`,
      syncStatus: "published",
    };
  },

  async updateListing(listingRef, item) {
    return {
      externalListingId: String(listingRef ?? item.id),
      syncStatus: "published",
    };
  },

  async unpublishListing() {
    return;
  },

  async importOrders() {
    return [];
  },
};
