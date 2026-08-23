export type ItemStatus = "draft" | "active" | "archived";
export type ConnectorType = "fulfillment" | "marketplace";
export type SyncStatus =
  | "not_published"
  | "published"
  | "sync_pending"
  | "sync_error";
export type AdjustmentStatus = "proposed" | "approved" | "reverted";

export interface ConnectorRegistry {
  id: string;
  key: string;
  type: ConnectorType;
  display_name: string;
  is_enabled: boolean;
}

export interface Item {
  id: string;
  user_id: string;
  name: string;
  description: string;
  base_price_cents: number;
  status: ItemStatus;
  product_type: string;
  fulfillment_provider_key: string | null;
  created_at: string;
  updated_at: string;
}

export type ArtworkSide = "front" | "back";

export interface ItemArtwork {
  id: string;
  item_id: string;
  side: ArtworkSide;
  storage_path: string;
  original_filename: string;
  width_px: number | null;
  height_px: number | null;
}

export interface DesignPlacement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface ProviderProductRef {
  id: string;
  name: string;
  category: string;
  baseCostCents: number;
  areaId: string;
}

export interface PrintableAreaState {
  areaId: string;
  label: string;
  widthPx: number;
  heightPx: number;
  widthInches: number;
  heightInches: number;
  placement: DesignPlacement;
}

/** Placement state keyed by garment side. */
export type PrintableAreasMap = {
  front?: PrintableAreaState;
  back?: PrintableAreaState;
};

export interface ItemDesign {
  id: string;
  item_id: string;
  printable_areas: PrintableAreasMap;
  provider_product_ref: ProviderProductRef;
}

export interface ItemVariant {
  id: string;
  item_id: string;
  label: string;
  sku: string | null;
  price_cents_override: number | null;
  attributes: {
    color?: string;
    size?: string;
  };
}

export interface ProviderDesignAdjustmentRow {
  id: string;
  item_design_id: string;
  provider_key: string;
  adjustment: DesignPlacement;
  status: AdjustmentStatus;
}

export interface ChannelListing {
  id: string;
  item_id: string;
  connector_key: string;
  external_listing_id: string | null;
  sync_status: SyncStatus;
  last_synced_at: string | null;
}

export interface ItemWithRelations extends Item {
  item_artwork: ItemArtwork[];
  item_designs: ItemDesign | null;
  item_variants: ItemVariant[];
  provider_design_adjustments: ProviderDesignAdjustmentRow[];
  channel_listings: (ChannelListing & {
    connector_registry: Pick<ConnectorRegistry, "display_name"> | null;
  })[];
  fulfillment_provider: Pick<ConnectorRegistry, "display_name"> | null;
}

export interface DashboardStats {
  totalItems: number;
  publishedItems: number;
  totalOrders: number;
  ordersNeedingAttention: number;
}
