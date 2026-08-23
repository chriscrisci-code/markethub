import { hasPrintfulToken, printfulFetch } from "./client";
import type {
  BillingInfo,
  FulfillmentConnector,
  FulfillmentJobResult,
  FulfillmentStatus,
  MasterDesign,
  NormalizedOrder,
  PrintableArea,
  ProviderDesignAdjustment,
  ProviderProduct,
  ValidationIssue,
  ValidationResult,
} from "../types";

type PrintfulCatalogProduct = {
  id: number;
  type: string;
  type_name: string;
  title: string;
  is_discontinued?: boolean;
};

type PrintfulProductDetail = {
  product: PrintfulCatalogProduct & {
    description?: string;
  };
  variants: Array<{
    id: number;
    product_id: number;
    name: string;
    size: string;
    color: string;
    price: string;
    in_stock: boolean;
  }>;
};

type PrintfulPrintfiles = {
  product_id: number;
  available_placements: Record<string, string>;
  printfiles: Array<{
    printfile_id: number;
    width: number;
    height: number;
    dpi: number;
  }>;
  variant_printfiles: Array<{
    variant_id: number;
    placements: Record<string, number>;
  }>;
};

type PrintfulOrder = {
  id: number;
  status: string;
  costs?: { total?: string; currency?: string };
  shipments?: Array<{
    carrier?: string;
    tracking_number?: string | number;
  }>;
};

/** Popular apparel catalog IDs — keeps Product Designer fast vs full catalog. */
const FEATURED_PRODUCT_IDS = [
  71, // Bella + Canvas 3001 Unisex Tee
  146, // Unisex Hoodie (common)
  162, // Poster (example variety)
];

let productsCache: { at: number; products: ProviderProduct[] } | null = null;
const CACHE_MS = 60 * 60 * 1000;

function dollarsToCents(value: string | number | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function mapStatus(status: string): string {
  switch (status) {
    case "draft":
      return "submitted";
    case "pending":
    case "inprocess":
    case "onhold":
      return "in_production";
    case "partial":
    case "fulfilled":
      return "shipped";
    case "canceled":
    case "archived":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return status;
  }
}

async function loadProduct(productId: number): Promise<ProviderProduct | null> {
  try {
    const detail = await printfulFetch<PrintfulProductDetail>(
      `/products/${productId}`
    );
    const printfiles = await printfulFetch<PrintfulPrintfiles>(
      `/mockup-generator/printfiles/${productId}`
    );

    const variants = (detail.variants ?? []).filter((v) => v.in_stock !== false);
    const colors = Array.from(
      new Set(variants.map((v) => v.color).filter(Boolean))
    );
    const sizes = Array.from(
      new Set(variants.map((v) => v.size).filter(Boolean))
    );

    const prices = variants.map((v) => dollarsToCents(v.price)).filter((p) => p > 0);
    const baseCostCents = prices.length ? Math.min(...prices) : 0;

    const printableAreas: PrintableArea[] = [];
    const placementEntries = Object.entries(
      printfiles.available_placements ?? {}
    );

    for (const [placementKey, label] of placementEntries) {
      const sampleVariant = printfiles.variant_printfiles?.[0];
      const printfileId = sampleVariant?.placements?.[placementKey];
      const pf = printfiles.printfiles?.find((p) => p.printfile_id === printfileId)
        ?? printfiles.printfiles?.[0];

      if (!pf) continue;

      printableAreas.push({
        id: placementKey,
        label,
        widthPx: pf.width,
        heightPx: pf.height,
        widthInches: Math.round((pf.width / pf.dpi) * 100) / 100,
        heightInches: Math.round((pf.height / pf.dpi) * 100) / 100,
      });
    }

    if (printableAreas.length === 0) {
      printableAreas.push({
        id: "front",
        label: "Front",
        widthPx: 1800,
        heightPx: 2400,
        widthInches: 12,
        heightInches: 16,
      });
    }

    return {
      id: String(detail.product.id),
      name: detail.product.title,
      category: detail.product.type_name || detail.product.type || "apparel",
      baseCostCents,
      printableAreas,
      colors,
      sizes,
    };
  } catch {
    return null;
  }
}

export const printfulConnector: FulfillmentConnector = {
  key: "printful",
  displayName: "Printful",

  async getProducts() {
    if (!hasPrintfulToken()) {
      return [];
    }

    if (productsCache && Date.now() - productsCache.at < CACHE_MS) {
      return productsCache.products;
    }

    try {
      const loaded = await Promise.all(
        FEATURED_PRODUCT_IDS.map((id) => loadProduct(id))
      );
      const products = loaded.filter((p): p is ProviderProduct => p != null);

      if (products.length === 0) {
        const catalog = await printfulFetch<PrintfulCatalogProduct[]>("/products");
        const candidates = (catalog ?? [])
          .filter((p) => !p.is_discontinued)
          .filter((p) =>
            ["T-SHIRT", "HOODIE", "SWEATSHIRT", "POSTER"].includes(p.type)
          )
          .slice(0, 6);

        const more = await Promise.all(candidates.map((p) => loadProduct(p.id)));
        const fallback = more.filter((p): p is ProviderProduct => p != null);
        productsCache = { at: Date.now(), products: fallback };
        return fallback;
      }

      productsCache = { at: Date.now(), products };
      return products;
    } catch (error) {
      console.error("Printful getProducts failed:", error);
      return [];
    }
  },

  async getPrintableAreas(productRef) {
    const productId =
      typeof productRef === "object" &&
      productRef !== null &&
      "id" in productRef
        ? String((productRef as { id: string }).id)
        : String(productRef);

    const products = await this.getProducts();
    const match = products.find((p) => p.id === productId);
    return match?.printableAreas ?? [];
  },

  async validateDesign(
    design: MasterDesign,
    productRef: unknown
  ): Promise<ValidationResult> {
    const areas = await this.getPrintableAreas(productRef);
    const area = areas[0];
    if (!area) {
      return {
        valid: false,
        issues: [
          {
            code: "NO_PRINT_AREA",
            message: "No printable area found for this Printful product.",
          },
        ],
      };
    }

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

  async proposeFix(
    design: MasterDesign,
    issue: ValidationIssue
  ): Promise<ProviderDesignAdjustment> {
    return {
      providerKey: this.key,
      adjustment: { ...design.placement, scale: design.placement.scale * 0.85 },
      description: `Auto fix for: ${issue.message}`,
    };
  },

  async submitFulfillment(order: NormalizedOrder): Promise<FulfillmentJobResult> {
    if (!order.recipient) {
      throw new Error("Printful fulfillment requires shipping recipient data.");
    }
    if (!order.fulfillmentItems?.length) {
      throw new Error(
        "Printful fulfillment requires a catalog variant and artwork URL. Save a Printful product design with variants first."
      );
    }

    const created = await printfulFetch<PrintfulOrder>("/orders", {
      method: "POST",
      body: JSON.stringify({
        external_id: order.externalOrderId,
        recipient: {
          name: order.recipient.name,
          email: order.recipient.email,
          address1: order.recipient.address1,
          city: order.recipient.city,
          state_code: order.recipient.stateCode,
          country_code: order.recipient.countryCode || "US",
          zip: order.recipient.postalCode,
        },
        items: order.fulfillmentItems.map((item, index) => ({
          external_id: `${order.externalOrderId}-${index}`,
          variant_id: item.variantId,
          quantity: item.quantity,
          name: item.name,
          files: item.files,
        })),
      }),
    });

    return {
      externalJobId: String(created.id),
      status: mapStatus(created.status),
    };
  },

  async getFulfillmentStatus(jobRef: unknown): Promise<FulfillmentStatus> {
    const order = await printfulFetch<PrintfulOrder>(`/orders/${jobRef}`);
    const shipment = order.shipments?.[0];

    return {
      status: mapStatus(order.status),
      carrier: shipment?.carrier,
      trackingNumber:
        shipment?.tracking_number != null
          ? String(shipment.tracking_number)
          : undefined,
    };
  },

  async getBilling(jobRef: unknown): Promise<BillingInfo | null> {
    const order = await printfulFetch<PrintfulOrder>(`/orders/${jobRef}`);
    if (!order.costs?.total) return null;
    return {
      amountCents: dollarsToCents(order.costs.total),
      confirmed: ["fulfilled", "partial"].includes(order.status),
    };
  },
};

/** Resolve Printful catalog variant_id from product + color + size. */
export async function resolvePrintfulVariantId(
  productId: string,
  color: string,
  size: string
): Promise<number | null> {
  const detail = await printfulFetch<PrintfulProductDetail>(
    `/products/${productId}`
  );
  const match = detail.variants.find(
    (v) =>
      v.color.toLowerCase() === color.toLowerCase() &&
      v.size.toLowerCase() === size.toLowerCase()
  );
  return match?.id ?? null;
}
