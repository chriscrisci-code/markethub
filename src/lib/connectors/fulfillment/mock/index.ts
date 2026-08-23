import type {
  FulfillmentConnector,
  MasterDesign,
  ProviderProduct,
  ValidationIssue,
} from "../types";

const mockProducts: ProviderProduct[] = [
  {
    id: "mock-tee-001",
    name: "Classic Cotton Tee",
    category: "apparel",
    baseCostCents: 1240,
    printableAreas: [
      {
        id: "front",
        label: "Front",
        widthInches: 12,
        heightInches: 16,
        widthPx: 3600,
        heightPx: 4800,
      },
    ],
    colors: ["Black", "White", "Navy"],
    colorHexByName: {
      Black: "#1a1a1a",
      White: "#f5f5f5",
      Navy: "#1e3a5f",
    },
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: "mock-hoodie-001",
    name: "Premium Hoodie",
    category: "apparel",
    baseCostCents: 2890,
    printableAreas: [
      {
        id: "front",
        label: "Front",
        widthInches: 12,
        heightInches: 14,
        widthPx: 3600,
        heightPx: 4200,
      },
    ],
    colors: ["Black", "Heather Gray"],
    colorHexByName: {
      Black: "#1a1a1a",
      "Heather Gray": "#9ca3af",
    },
    sizes: ["S", "M", "L", "XL", "2XL"],
  },
];

const jobProgress = new Map<string, number>();

export const mockFulfillmentConnector: FulfillmentConnector = {
  key: "mock-fulfillment",
  displayName: "Mock Fulfillment Provider",

  async getProducts() {
    return mockProducts;
  },

  async getPrintableAreas(productRef) {
    const productId =
      typeof productRef === "object" &&
      productRef !== null &&
      "id" in productRef
        ? String((productRef as { id: string }).id)
        : "mock-tee-001";
    const product = mockProducts.find((p) => p.id === productId);
    return product?.printableAreas ?? mockProducts[0].printableAreas;
  },

  async validateDesign(design: MasterDesign, productRef) {
    const areas = await this.getPrintableAreas(productRef);
    const area = areas[0];
    const scaledWidth = design.widthPx * design.placement.scale;
    const scaledHeight = design.heightPx * design.placement.scale;

    if (scaledWidth > area.widthPx || scaledHeight > area.heightPx) {
      return {
        valid: false,
        issues: [
          {
            code: "ARTWORK_EXCEEDS_PRINT_AREA",
            message: "Artwork exceeds this provider's printable area.",
          },
        ],
      };
    }

    return { valid: true, issues: [] };
  },

  async proposeFix(design: MasterDesign, issue: ValidationIssue) {
    return {
      providerKey: this.key,
      adjustment: { ...design.placement, scale: design.placement.scale * 0.85 },
      description: `Auto fix for: ${issue.message}`,
    };
  },

  async submitFulfillment(order) {
    return {
      externalJobId: `mock-job-${order.externalOrderId}`,
      status: "submitted",
    };
  },

  async getFulfillmentStatus(jobRef) {
    const id = String(jobRef ?? "unknown");
    const step = (jobProgress.get(id) ?? 0) + 1;
    jobProgress.set(id, step);

    if (step >= 2) {
      return {
        status: "shipped",
        trackingNumber: `MOCK${id.slice(-6).toUpperCase()}`,
        carrier: "USPS",
      };
    }

    return {
      status: "in_production",
    };
  },

  async getBilling(jobRef) {
    const id = String(jobRef ?? "unknown");
    const step = jobProgress.get(id) ?? 0;
    if (step < 2) return null;
    return { amountCents: 1240, confirmed: true };
  },
};
