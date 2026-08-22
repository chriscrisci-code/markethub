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

export interface FulfillmentConnector {
  key: string;
  displayName: string;
  getProducts(): Promise<ProviderProduct[]>;
  getPrintableAreas(productRef: unknown): Promise<PrintableArea[]>;
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
