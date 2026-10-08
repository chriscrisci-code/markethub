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

  async updateOrderTracking() {
    return;
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

  async updateOrderTracking() {
    return;
  },
};

/** Placeholder until Etsy OAuth. Each Etsy account is its own storefront row. */
export const etsyConnector: MarketplaceConnector = {
  key: "etsy",
  displayName: "Etsy",

  async connect() {
    return { externalAccountId: "etsy-pending", status: "connected" };
  },

  async publishListing(item) {
    return {
      externalListingId: `etsy-listing-${item.id.slice(0, 8)}`,
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

  async updateOrderTracking() {
    return;
  },
};
