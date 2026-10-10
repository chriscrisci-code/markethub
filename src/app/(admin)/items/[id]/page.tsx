import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelStatusCards } from "@/components/admin/channel-status-cards";
import {
  ItemArtworkCard,
  ItemArtworkProvider,
  ItemProductDesignerCard,
} from "@/components/admin/item-artwork-shell";
import { ItemForm } from "@/components/admin/item-form";
import { getFulfillmentConnector } from "@/lib/connectors/fulfillment/registry";
import { getChannelStatuses } from "@/lib/connectors/marketplace/registry";
import {
  getArtworkUrl,
  getFulfillmentProviders,
  getItem,
  getMarketplaceConnectors,
  getMockupUrl,
  getStorefronts,
} from "@/lib/data/queries";
import { artworkBySide } from "@/lib/domain/artwork-sides";
import type { SavedMockup } from "@/lib/mockups/saved-client";
import { sortApparelSizes } from "@/lib/variants/combinations";

export const maxDuration = 60;

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let item = await getItem(id);

  if (!item) {
    notFound();
  }

  const providerKey = item.fulfillment_provider_key ?? "mock-fulfillment";
  const connector = getFulfillmentConnector(providerKey);

  let products: Awaited<ReturnType<NonNullable<typeof connector>["getProducts"]>> =
    [];
  let catalogError: string | null = null;

  if (connector) {
    try {
      products = await connector.getProducts();
      if (providerKey === "printful" && products.length === 0) {
        catalogError =
          "Could not load Printful products. Add PRINTFUL_API_TOKEN in Vercel (or .env.local), then redeploy/restart.";
      }
    } catch (error) {
      console.error("Fulfillment catalog error:", error);
      catalogError =
        error instanceof Error
          ? error.message
          : "Failed to load fulfillment products.";
    }
  }

  const bySide = artworkBySide(item.item_artwork);
  const [fulfillmentProviders, marketplaces, storefronts, frontUrl, backUrl] =
    await Promise.all([
      getFulfillmentProviders(),
      getMarketplaceConnectors(),
      getStorefronts(),
      bySide.front?.storage_path
        ? getArtworkUrl(bySide.front.storage_path)
        : Promise.resolve(null),
      bySide.back?.storage_path
        ? getArtworkUrl(bySide.back.storage_path)
        : Promise.resolve(null),
    ]);

  const channelStatuses = getChannelStatuses(
    storefronts,
    item.channel_listings,
    marketplaces
  );

  const providerNameByKey = new Map(
    fulfillmentProviders.map((provider) => [provider.key, provider.display_name])
  );

  const initialSavedMockups: SavedMockup[] = await Promise.all(
    (item.item_mockups ?? []).map(async (mockup) => {
      const providerKey = mockup.fulfillment_provider_key;
      return {
        id: mockup.id,
        item_id: mockup.item_id,
        storage_path: mockup.storage_path,
        source_url: mockup.source_url,
        label: mockup.label,
        color_name: mockup.color_name ?? null,
        fulfillment_provider_key: providerKey ?? null,
        fulfillment_provider_name: providerKey
          ? (providerNameByKey.get(providerKey) ?? providerKey)
          : (item.fulfillment_provider?.display_name ?? null),
        variant_id: mockup.variant_id ?? null,
        sizes: sortApparelSizes(
          (item.item_variants ?? [])
            .filter((variant) => {
              const color = variant.attributes?.color?.trim().toLowerCase();
              return (
                Boolean(variant.sku) &&
                Boolean(variant.attributes?.size) &&
                color === (mockup.color_name ?? "").trim().toLowerCase()
              );
            })
            .map((variant) => variant.attributes.size as string)
        ),
        created_at: mockup.created_at,
        url: await getMockupUrl(mockup.storage_path),
      };
    })
  );

  return (
    <ItemArtworkProvider
      itemId={item.id}
      initialArtworkUrls={{ front: frontUrl, back: backUrl }}
      initialArtworkStoragePaths={{
        front: bySide.front?.storage_path ?? null,
        back: bySide.back?.storage_path ?? null,
      }}
      initialFilenames={{
        front: bySide.front?.original_filename ?? null,
        back: bySide.back?.original_filename ?? null,
      }}
    >
      <div className="space-y-8">
        <div>
          <p className="text-sm text-muted-foreground">Item</p>
          <h1 className="text-3xl font-semibold tracking-tight">{item.name}</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent>
              <ItemForm item={item} fulfillmentProviders={fulfillmentProviders} />
            </CardContent>
          </Card>

          <ItemArtworkCard />
        </div>

        <ItemProductDesignerCard
          providerKey={providerKey}
          salePriceCents={item.base_price_cents}
          products={products}
          initialDesign={item.item_designs}
          initialVariants={item.item_variants}
          initialAdjustments={item.provider_design_adjustments}
          initialSavedMockups={initialSavedMockups}
          catalogError={catalogError}
        />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Sales Channels</CardTitle>
              <Link
                href="/storefronts"
                className="text-sm text-muted-foreground underline"
              >
                Manage storefronts
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <ChannelStatusCards itemId={item.id} channels={channelStatuses} />
          </CardContent>
        </Card>
      </div>
    </ItemArtworkProvider>
  );
}
