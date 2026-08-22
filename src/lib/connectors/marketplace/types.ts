import type { Item, ItemArtwork } from "@/lib/types/database";

export interface MasterItem extends Item {
  artwork?: ItemArtwork | null;
}

export interface ListingResult {
  externalListingId: string;
  syncStatus: "published" | "sync_pending" | "sync_error";
}

export interface ConnectionResult {
  externalAccountId: string;
  status: "connected";
}

export interface TrackingInfo {
  carrier: string;
  trackingNumber: string;
}

export interface NormalizedMarketplaceOrder {
  externalOrderId: string;
  saleAmountCents: number;
  customer: Record<string, string>;
  shipping: Record<string, string>;
  lineItems: Array<{ label: string; quantity: number; unitPriceCents: number }>;
}

export interface MarketplaceConnector {
  key: string;
  displayName: string;
  connect(credentials: unknown): Promise<ConnectionResult>;
  publishListing(item: MasterItem): Promise<ListingResult>;
  updateListing(listingRef: unknown, item: MasterItem): Promise<ListingResult>;
  unpublishListing(listingRef: unknown): Promise<void>;
  importOrders(since?: Date): Promise<NormalizedMarketplaceOrder[]>;
  updateOrderTracking?(
    listingRef: unknown,
    tracking: TrackingInfo
  ): Promise<void>;
}

export interface ChannelStatus {
  connectorKey: string;
  displayName: string;
  syncStatus: "not_published" | "published" | "sync_pending" | "sync_error";
  canPublish: boolean;
  canUpdate: boolean;
}
