import { notFound } from "next/navigation";
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
  ensureChannelListings,
  getArtworkUrl,
  getFulfillmentProviders,
  getItem,
  getMarketplaceConnectors,
} from "@/lib/data/queries";
import { artworkBySide } from "@/lib/domain/artwork-sides";

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

  if (item.channel_listings.length === 0) {
    await ensureChannelListings(id);
    item = (await getItem(id))!;
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
  const [fulfillmentProviders, marketplaces, frontUrl, backUrl] =
    await Promise.all([
      getFulfillmentProviders(),
      getMarketplaceConnectors(),
      bySide.front?.storage_path
        ? getArtworkUrl(bySide.front.storage_path)
        : Promise.resolve(null),
      bySide.back?.storage_path
        ? getArtworkUrl(bySide.back.storage_path)
        : Promise.resolve(null),
    ]);

  const channelStatuses = getChannelStatuses(
    marketplaces,
    item.channel_listings
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
          catalogError={catalogError}
        />

        <Card>
          <CardHeader>
            <CardTitle>Sales Channels</CardTitle>
          </CardHeader>
          <CardContent>
            <ChannelStatusCards itemId={item.id} channels={channelStatuses} />
          </CardContent>
        </Card>
      </div>
    </ItemArtworkProvider>
  );
}
