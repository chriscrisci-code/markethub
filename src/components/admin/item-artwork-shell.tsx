"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArtworkUpload } from "@/components/admin/artwork-upload";
import { ProductDesigner } from "@/components/admin/product-designer";
import {
  signArtworkStoragePath,
  type ArtworkSideState,
} from "@/lib/artwork/client";
import type { ProviderProduct } from "@/lib/connectors/fulfillment/types";
import type {
  ArtworkSide,
  ItemDesign,
  ItemVariant,
  ProviderDesignAdjustmentRow,
} from "@/lib/types/database";

type SideMap = Record<ArtworkSide, ArtworkSideState>;

type ItemArtworkContextValue = {
  itemId: string;
  artworkBySide: SideMap;
  artworkUrls: Record<ArtworkSide, string | null>;
  artworkStoragePaths: Record<ArtworkSide, string | null>;
  handleArtworkChanged: (
    side: ArtworkSide,
    next: ArtworkSideState | null
  ) => Promise<void>;
};

const ItemArtworkContext = createContext<ItemArtworkContextValue | null>(null);

function useItemArtwork() {
  const ctx = useContext(ItemArtworkContext);
  if (!ctx) {
    throw new Error("ItemArtwork components must be used within ItemArtworkProvider");
  }
  return ctx;
}

function toSideMap(input: {
  urls: Record<ArtworkSide, string | null>;
  storagePaths: Record<ArtworkSide, string | null>;
  filenames: Record<ArtworkSide, string | null>;
}): SideMap {
  return {
    front: {
      url: input.urls.front,
      storagePath: input.storagePaths.front,
      filename: input.filenames.front,
    },
    back: {
      url: input.urls.back,
      storagePath: input.storagePaths.back,
      filename: input.filenames.back,
    },
  };
}

export function ItemArtworkProvider({
  itemId,
  initialArtworkUrls,
  initialArtworkStoragePaths,
  initialFilenames,
  children,
}: {
  itemId: string;
  initialArtworkUrls: Record<ArtworkSide, string | null>;
  initialArtworkStoragePaths: Record<ArtworkSide, string | null>;
  initialFilenames: Record<ArtworkSide, string | null>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [artworkBySide, setArtworkBySide] = useState<SideMap>(() =>
    toSideMap({
      urls: initialArtworkUrls,
      storagePaths: initialArtworkStoragePaths,
      filenames: initialFilenames,
    })
  );

  useEffect(() => {
    setArtworkBySide(
      toSideMap({
        urls: initialArtworkUrls,
        storagePaths: initialArtworkStoragePaths,
        filenames: initialFilenames,
      })
    );
  }, [
    initialArtworkUrls.front,
    initialArtworkUrls.back,
    initialArtworkStoragePaths.front,
    initialArtworkStoragePaths.back,
    initialFilenames.front,
    initialFilenames.back,
  ]);

  const handleArtworkChanged = useCallback(
    async (side: ArtworkSide, next: ArtworkSideState | null) => {
      if (!next) {
        setArtworkBySide((prev) => ({
          ...prev,
          [side]: { url: null, storagePath: null, filename: null },
        }));
        void router.refresh();
        return;
      }

      let url = next.url;
      if (!url && next.storagePath) {
        const signed = await signArtworkStoragePath(next.storagePath);
        url = signed.url ?? null;
      }

      setArtworkBySide((prev) => ({
        ...prev,
        [side]: {
          url,
          storagePath: next.storagePath,
          filename: next.filename,
        },
      }));
      void router.refresh();
    },
    [router]
  );

  const value = useMemo(
    () => ({
      itemId,
      artworkBySide,
      artworkUrls: {
        front: artworkBySide.front.url,
        back: artworkBySide.back.url,
      },
      artworkStoragePaths: {
        front: artworkBySide.front.storagePath,
        back: artworkBySide.back.storagePath,
      },
      handleArtworkChanged,
    }),
    [itemId, artworkBySide, handleArtworkChanged]
  );

  return (
    <ItemArtworkContext.Provider value={value}>
      {children}
    </ItemArtworkContext.Provider>
  );
}

export function ItemArtworkCard() {
  const { itemId, artworkBySide, handleArtworkChanged } = useItemArtwork();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Artwork</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2">
          <ArtworkUpload
            itemId={itemId}
            side="front"
            artworkUrl={artworkBySide.front.url}
            filename={artworkBySide.front.filename}
            onArtworkChanged={handleArtworkChanged}
          />
          <ArtworkUpload
            itemId={itemId}
            side="back"
            artworkUrl={artworkBySide.back.url}
            filename={artworkBySide.back.filename}
            onArtworkChanged={handleArtworkChanged}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function ItemProductDesignerCard({
  providerKey,
  salePriceCents,
  products,
  initialDesign,
  initialVariants,
  initialAdjustments,
  catalogError,
}: {
  providerKey: string;
  salePriceCents: number;
  products: ProviderProduct[];
  initialDesign: ItemDesign | null;
  initialVariants: ItemVariant[];
  initialAdjustments: ProviderDesignAdjustmentRow[];
  catalogError: string | null;
}) {
  const { itemId, artworkUrls } = useItemArtwork();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Designer</CardTitle>
      </CardHeader>
      <CardContent>
        {catalogError ? (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {catalogError}
          </p>
        ) : null}
        <ProductDesigner
          itemId={itemId}
          providerKey={providerKey}
          salePriceCents={salePriceCents}
          artworkUrls={artworkUrls}
          products={products}
          initialDesign={initialDesign}
          initialVariants={initialVariants}
          initialAdjustments={initialAdjustments}
        />
      </CardContent>
    </Card>
  );
}
