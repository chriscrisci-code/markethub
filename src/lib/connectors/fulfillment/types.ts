export interface PrintableArea {
  id: string;
  label: string;
  widthInches: number;
  heightInches: number;
  widthPx: number;
  heightPx: number;
}

export interface ProviderProduct {
  id: string;
  name: string;
  category: string;
  baseCostCents: number;
  printableAreas: PrintableArea[];
  colors: string[];
  /** Hex swatches keyed by color name (e.g. Printful color_code). */
  colorHexByName?: Record<string, string>;
  sizes: string[];
}

export interface MasterDesign {
  artworkUrl: string;
  widthPx: number;
  heightPx: number;
  placement: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
}

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ProviderDesignAdjustment {
  providerKey: string;
  adjustment: MasterDesign["placement"];
  description: string;
}

export interface NormalizedOrder {
  externalOrderId: string;
  saleAmountCents: number;
  lineItems: Array<{ label: string; quantity: number; unitPriceCents: number }>;
  recipient?: {
    name?: string;
    email?: string;
    address1?: string;
    city?: string;
    stateCode?: string;
    postalCode?: string;
    countryCode?: string;
  };
  fulfillmentItems?: Array<{
    variantId: number;
    quantity: number;
    name: string;
    files: Array<{ type: string; url: string }>;
  }>;
}

export interface FulfillmentJobResult {
  externalJobId: string;
  status: string;
}

export interface FulfillmentStatus {
  status: string;
  trackingNumber?: string;
  carrier?: string;
}

export interface BillingInfo {
  amountCents: number;
  confirmed: boolean;
}

export interface ProviderTemplate {
  imageUrl: string;
  /** Colored garment photo when Printful provides one for the variant. */
  backgroundUrl?: string | null;
  backgroundColor?: string | null;
  templateWidth: number;
  templateHeight: number;
  printAreaLeft: number;
  printAreaTop: number;
  printAreaWidth: number;
  printAreaHeight: number;
  placementId: string;
}

export interface ProviderMockupResult {
  taskKey: string;
  status: "pending" | "completed" | "failed" | string;
  mockups: Array<{
    placement?: string;
    mockupUrl: string;
    variantIds?: number[];
  }>;
  error?: string;
}

export interface FulfillmentConnector {
  key: string;
  displayName: string;
  getProducts(): Promise<ProviderProduct[]>;
  getPrintableAreas(productRef: unknown): Promise<PrintableArea[]>;
  getProductTemplate?(
    productRef: unknown,
    options?: { areaId?: string; color?: string }
  ): Promise<ProviderTemplate | null>;
  startMockupGeneration?(input: {
    productId: string;
    color: string;
    size: string;
    areaId: string;
    artworkUrl: string;
    areaWidthPx: number;
    areaHeightPx: number;
    placement: MasterDesign["placement"];
    artworkWidthPx: number;
    artworkHeightPx: number;
  }): Promise<{ taskKey: string }>;
  getMockupTask?(taskKey: string): Promise<ProviderMockupResult>;
  validateDesign(
    design: MasterDesign,
    productRef: unknown
  ): Promise<ValidationResult>;
  proposeFix(
    design: MasterDesign,
    issue: ValidationIssue
  ): Promise<ProviderDesignAdjustment>;
  submitFulfillment(order: NormalizedOrder): Promise<FulfillmentJobResult>;
  getFulfillmentStatus(jobRef: unknown): Promise<FulfillmentStatus>;
  getBilling?(jobRef: unknown): Promise<BillingInfo | null>;
}
