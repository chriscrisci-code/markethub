"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  approveDesignAdjustment,
  proposeDesignAutoFix,
  revertDesignAdjustment,
  saveItemDesign,
  saveItemVariants,
  updateArtworkDimensions,
  validateItemDesign,
} from "@/lib/actions/design";
import {
  DEFAULT_PLACEMENT,
  estimateMarginCents,
  fitPlacementToArea,
} from "@/lib/domain/design";
import { formatCents } from "@/lib/domain/format";
import { getProductSideAreas } from "@/lib/domain/artwork-sides";
import { fetchProviderTemplate } from "@/lib/actions/templates";
import {
  pollMockupViaApi,
  startMockupViaApi,
} from "@/lib/mockups/client";
import type {
  MockupPrintFile,
  ProviderProduct,
  ProviderTemplate,
} from "@/lib/connectors/fulfillment/types";
import type {
  ArtworkSide,
  DesignPlacement,
  ItemDesign,
  ItemVariant,
  PrintableAreasMap,
  ProviderDesignAdjustmentRow,
  ProviderProductRef,
} from "@/lib/types/database";
import { cn } from "@/lib/utils";

const PlacementCanvas = dynamic(
  () =>
    import("@/components/admin/placement-canvas").then(
      (mod) => mod.PlacementCanvas
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-64 items-center justify-center rounded-xl border text-sm text-muted-foreground">
        Loading designer…
      </div>
    ),
  }
);

type ValidationState =
  | { status: "idle" }
  | { status: "valid" }
  | {
      status: "invalid";
      message: string;
    };

export function ProductDesigner({
  itemId,
  providerKey,
  salePriceCents,
  artworkUrls,
  products,
  initialDesign,
  initialVariants,
  initialAdjustments,
}: {
  itemId: string;
  providerKey: string;
  salePriceCents: number;
  artworkUrls: Record<ArtworkSide, string | null>;
  products: ProviderProduct[];
  initialDesign: ItemDesign | null;
  initialVariants: ItemVariant[];
  initialAdjustments: ProviderDesignAdjustmentRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedProductId, setSelectedProductId] = useState(
    initialDesign?.provider_product_ref?.id ?? products[0]?.id ?? ""
  );
  const selectedProduct =
    products.find((p) => p.id === selectedProductId) ?? products[0] ?? null;

  const sideAreas = useMemo(
    () =>
      selectedProduct
        ? getProductSideAreas(selectedProduct)
        : { front: null, back: null },
    [selectedProduct]
  );

  const [activeSide, setActiveSide] = useState<ArtworkSide>("front");
  const [placements, setPlacements] = useState<
    Record<ArtworkSide, DesignPlacement>
  >(() => ({
    front:
      initialDesign?.printable_areas?.front?.placement ?? DEFAULT_PLACEMENT,
    back: initialDesign?.printable_areas?.back?.placement ?? DEFAULT_PLACEMENT,
  }));
  const [artworkSizes, setArtworkSizes] = useState<
    Record<ArtworkSide, { width: number; height: number }>
  >({
    front: { width: 0, height: 0 },
    back: { width: 0, height: 0 },
  });

  const [selectedColors, setSelectedColors] = useState<string[]>(() => {
    const colors = new Set(
      initialVariants
        .map((v) => v.attributes.color)
        .filter((c): c is string => Boolean(c))
    );
    return colors.size > 0
      ? Array.from(colors)
      : selectedProduct?.colors.slice(0, 1) ?? [];
  });
  const [selectedSizes, setSelectedSizes] = useState<string[]>(() => {
    const sizes = new Set(
      initialVariants
        .map((v) => v.attributes.size)
        .filter((s): s is string => Boolean(s))
    );
    return sizes.size > 0
      ? Array.from(sizes)
      : selectedProduct?.sizes.slice(0, 2) ?? [];
  });
  const [validation, setValidation] = useState<ValidationState>({
    status: "idle",
  });
  const [proposedAdjustment, setProposedAdjustment] =
    useState<ProviderDesignAdjustmentRow | null>(
      initialAdjustments.find((a) => a.status === "proposed") ?? null
    );
  const [templates, setTemplates] = useState<
    Record<ArtworkSide, ProviderTemplate | null>
  >({ front: null, back: null });
  const [mockupStatus, setMockupStatus] = useState<
    "idle" | "pending" | "completed" | "failed"
  >("idle");
  const [mockupUrls, setMockupUrls] = useState<string[]>([]);
  const [mockupError, setMockupError] = useState<string | null>(null);
  const [mockupProgress, setMockupProgress] = useState<string | null>(null);

  const previewColor = selectedColors[0] ?? null;
  const previewColorHex = previewColor
    ? selectedProduct?.colorHexByName?.[previewColor] ?? null
    : null;
  const previewSize = selectedSizes[0] ?? selectedProduct?.sizes[0] ?? null;

  useEffect(() => {
    if (!selectedProduct) {
      setTemplates({ front: null, back: null });
      return;
    }

    let cancelled = false;
    const color = selectedColors[0];

    void Promise.all(
      (["front", "back"] as const).map(async (side) => {
        const area = sideAreas[side];
        if (!area) return [side, null] as const;
        const result = await fetchProviderTemplate(
          providerKey,
          selectedProduct.id,
          area.id,
          color
        );
        return [side, result.template] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setTemplates({
        front: entries.find(([s]) => s === "front")?.[1] ?? null,
        back: entries.find(([s]) => s === "back")?.[1] ?? null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [providerKey, selectedProduct, sideAreas, selectedColors]);

  async function handleGenerateMockup() {
    const frontArea = sideAreas.front;
    const frontArtworkUrl = artworkUrls.front;

    if (!selectedProduct || !frontArea || !frontArtworkUrl) {
      toast.error("Upload front PNG/JPG artwork and select a product first.");
      return;
    }
    if (!previewColor || !previewSize) {
      toast.error("Select at least one color and size for the mockup.");
      return;
    }

    const files: MockupPrintFile[] = [];

    for (const side of ["front", "back"] as const) {
      const area = sideAreas[side];
      const artworkUrl = artworkUrls[side];
      if (!area || !artworkUrl) continue;

      const measured = artworkSizes[side];
      files.push({
        placement: area.id || side,
        artworkUrl,
        areaWidthPx: area.widthPx,
        areaHeightPx: area.heightPx,
        designPlacement: placements[side],
        artworkWidthPx: measured.width > 0 ? measured.width : 2000,
        artworkHeightPx: measured.height > 0 ? measured.height : 2000,
      });
    }

    setMockupError(null);
    setMockupUrls([]);
    setMockupStatus("pending");
    setMockupProgress("Resolving variant → create-task…");

    const MOCKUP_START_TIMEOUT_MS = 45_000;
    let started: Awaited<ReturnType<typeof startMockupViaApi>>;
    try {
      started = await Promise.race([
        startMockupViaApi({
          providerKey,
          productId: selectedProduct.id,
          color: previewColor,
          size: previewSize,
          files,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  "Mockup start timed out after 45s. Try again in a moment."
                )
              ),
            MOCKUP_START_TIMEOUT_MS
          );
        }),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not start mockup (unexpected error).";
      setMockupStatus("failed");
      setMockupProgress(null);
      setMockupError(message);
      toast.error(message);
      return;
    }

    if (started.error || !started.taskKey) {
      setMockupStatus("failed");
      setMockupProgress(null);
      const message = started.error ?? "Could not start mockup.";
      setMockupError(message);
      toast.error(message);
      return;
    }

    const taskKey = started.taskKey;
    setMockupProgress(`Task ${taskKey.slice(0, 12)}… waiting for Printful`);
    const deadline = Date.now() + 90_000;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const polled = await pollMockupViaApi(providerKey, taskKey);
      if (polled.error) {
        setMockupStatus("failed");
        setMockupProgress(null);
        setMockupError(polled.error);
        toast.error(polled.error);
        return;
      }
      const result = polled.result;
      if (!result) continue;

      setMockupProgress(`Status: ${result.status}`);

      if (result.status === "failed") {
        setMockupStatus("failed");
        setMockupProgress(null);
        setMockupError(result.error ?? "Mockup generation failed.");
        toast.error(result.error ?? "Mockup generation failed.");
        return;
      }

      if (result.status === "completed") {
        const urls = result.mockups.map((m) => m.mockupUrl);
        setMockupUrls(urls);
        setMockupStatus("completed");
        setMockupProgress(null);
        if (urls.length === 0) {
          setMockupError("Task completed but no mockup images were returned.");
        } else {
          toast.success(
            `Mockup ready (${urls.length} image${urls.length === 1 ? "" : "s"}).`
          );
        }
        return;
      }
    }

    setMockupStatus("failed");
    setMockupProgress(null);
    setMockupError("Timed out waiting for Printful mockup. Try again.");
    toast.error("Timed out waiting for mockup.");
  }

  const marginCents = useMemo(() => {
    if (!selectedProduct) return null;
    return estimateMarginCents(salePriceCents, selectedProduct.baseCostCents);
  }, [salePriceCents, selectedProduct]);

  const handleArtworkSizeFor = useCallback(
    (side: ArtworkSide) => (width: number, height: number) => {
      setArtworkSizes((prev) => ({
        ...prev,
        [side]: { width, height },
      }));
      void updateArtworkDimensions(itemId, width, height, side);
    },
    [itemId]
  );

  function setPlacementFor(side: ArtworkSide) {
    return (next: DesignPlacement) => {
      setPlacements((prev) => ({ ...prev, [side]: next }));
    };
  }

  function handleProductChange(productId: string) {
    const product = products.find((p) => p.id === productId);
    setSelectedProductId(productId);
    setValidation({ status: "idle" });
    setProposedAdjustment(null);
    setActiveSide("front");

    if (product) {
      setSelectedColors(product.colors.slice(0, 1));
      setSelectedSizes(product.sizes.slice(0, 2));
      const sides = getProductSideAreas(product);
      const next: Record<ArtworkSide, DesignPlacement> = {
        front: DEFAULT_PLACEMENT,
        back: DEFAULT_PLACEMENT,
      };
      for (const side of ["front", "back"] as const) {
        const area = sides[side];
        const size = artworkSizes[side];
        if (area && size.width > 0) {
          next[side] = fitPlacementToArea(
            size.width,
            size.height,
            area.widthPx,
            area.heightPx
          );
        }
      }
      setPlacements(next);
    }
  }

  function toggleValue(
    list: string[],
    value: string,
    setter: (next: string[]) => void
  ) {
    if (list.includes(value)) {
      setter(list.filter((v) => v !== value));
    } else {
      setter([...list, value]);
    }
  }

  function buildPrintableAreasMap(): PrintableAreasMap {
    const map: PrintableAreasMap = {};
    for (const side of ["front", "back"] as const) {
      const area = sideAreas[side];
      if (!area) continue;
      map[side] = {
        areaId: area.id,
        label: area.label,
        widthPx: area.widthPx,
        heightPx: area.heightPx,
        widthInches: area.widthInches,
        heightInches: area.heightInches,
        placement: placements[side],
      };
    }
    return map;
  }

  function buildProductRef(): ProviderProductRef | null {
    if (!selectedProduct || !sideAreas.front) return null;
    return {
      id: selectedProduct.id,
      name: selectedProduct.name,
      category: selectedProduct.category,
      baseCostCents: selectedProduct.baseCostCents,
      areaId: sideAreas.front.id,
    };
  }

  function handleSaveDesign() {
    const productRef = buildProductRef();
    const areas = buildPrintableAreasMap();
    if (!productRef || !areas.front) {
      toast.error("Choose a product first.");
      return;
    }

    startTransition(async () => {
      const result = await saveItemDesign(itemId, {
        providerProductRef: productRef,
        printableAreas: areas,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }

      const variantPairs = selectedColors.flatMap((color) =>
        selectedSizes.map((size) => ({ color, size }))
      );
      const variantResult = await saveItemVariants(itemId, variantPairs);
      if (variantResult.error) {
        toast.error(variantResult.error);
        return;
      }

      toast.success("Design saved.");
      setValidation({ status: "idle" });
    });
  }

  function handleValidate() {
    startTransition(async () => {
      const productRef = buildProductRef();
      const areas = buildPrintableAreasMap();
      if (productRef && areas.front) {
        await saveItemDesign(itemId, {
          providerProductRef: productRef,
          printableAreas: areas,
        });
      }

      const result = await validateItemDesign(itemId, activeSide);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.valid) {
        setValidation({ status: "valid" });
        toast.success(`${activeSide} design looks good for this provider.`);
      } else {
        setValidation({
          status: "invalid",
          message:
            result.issues?.[0]?.message ??
            "Artwork exceeds this provider's printable area.",
        });
      }
    });
  }

  function handleAutoFix() {
    startTransition(async () => {
      const result = await proposeDesignAutoFix(itemId, activeSide);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setProposedAdjustment(result.adjustment as ProviderDesignAdjustmentRow);
      toast.message("Proposed provider-specific fix ready for review.");
    });
  }

  function handleApproveFix() {
    if (!proposedAdjustment) return;
    startTransition(async () => {
      const result = await approveDesignAdjustment(
        itemId,
        proposedAdjustment.id
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Provider fix approved (master design unchanged).");
      setProposedAdjustment({ ...proposedAdjustment, status: "approved" });
      setValidation({ status: "valid" });
    });
  }

  function handleRevertFix() {
    if (!proposedAdjustment) return;
    startTransition(async () => {
      const result = await revertDesignAdjustment(
        itemId,
        proposedAdjustment.id
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Provider fix reverted.");
      setProposedAdjustment(null);
    });
  }

  if (!selectedProduct || !sideAreas.front) {
    return (
      <p className="text-sm text-muted-foreground">
        No fulfillment products available from this provider yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Physical product</Label>
            <select
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={selectedProduct.id}
              onChange={(event) => handleProductChange(event.target.value)}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({formatCents(product.baseCostCents)} cost)
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Front: {sideAreas.front.label} · {sideAreas.front.widthInches}
              &quot; × {sideAreas.front.heightInches}&quot;
              {sideAreas.back
                ? ` · Back: ${sideAreas.back.label} · ${sideAreas.back.widthInches}" × ${sideAreas.back.heightInches}"`
                : null}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Colors</Label>
            <div className="flex flex-wrap gap-2">
              {selectedProduct.colors.map((color) => {
                const active = selectedColors.includes(color);
                const hex = selectedProduct.colorHexByName?.[color];
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColors([color])}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    {hex ? (
                      <span
                        className="size-3.5 shrink-0 rounded-full border border-black/15"
                        style={{ backgroundColor: hex }}
                        aria-hidden
                      />
                    ) : null}
                    {color}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sizes</Label>
            <div className="flex flex-wrap gap-2">
              {selectedProduct.sizes.map((size) => {
                const active = selectedSizes.includes(size);
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() =>
                      toggleValue(selectedSizes, size, setSelectedSizes)
                    }
                    className={cn(
                      "rounded-md border px-3 py-1 text-sm transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedColors.length * selectedSizes.length} variant
              {selectedColors.length * selectedSizes.length === 1 ? "" : "s"}{" "}
              selected
            </p>
          </div>

          {marginCents !== null ? (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Estimated margin: </span>
              <span className="font-medium">{formatCents(marginCents)}</span>
              <span className="text-muted-foreground">
                {" "}
                (sale − fulfillment cost; fees come later)
              </span>
            </div>
          ) : null}
        </div>

        <div className="space-y-8">
          {sideAreas.front ? (
            <PlacementCanvas
              title="Placement — Front"
              artworkUrl={artworkUrls.front}
              areaWidthPx={sideAreas.front.widthPx}
              areaHeightPx={sideAreas.front.heightPx}
              areaWidthInches={sideAreas.front.widthInches}
              areaHeightInches={sideAreas.front.heightInches}
              placement={placements.front}
              template={templates.front}
              garmentColorHex={previewColorHex}
              previewPlacement={
                activeSide === "front" &&
                proposedAdjustment?.status === "proposed"
                  ? (proposedAdjustment.adjustment as DesignPlacement)
                  : null
              }
              onChange={setPlacementFor("front")}
              onArtworkSize={handleArtworkSizeFor("front")}
            />
          ) : null}

          {sideAreas.back ? (
            <PlacementCanvas
              title="Placement — Back"
              artworkUrl={artworkUrls.back}
              areaWidthPx={sideAreas.back.widthPx}
              areaHeightPx={sideAreas.back.heightPx}
              areaWidthInches={sideAreas.back.widthInches}
              areaHeightInches={sideAreas.back.heightInches}
              placement={placements.back}
              template={templates.back}
              garmentColorHex={previewColorHex}
              previewPlacement={
                activeSide === "back" &&
                proposedAdjustment?.status === "proposed"
                  ? (proposedAdjustment.adjustment as DesignPlacement)
                  : null
              }
              onChange={setPlacementFor("back")}
              onArtworkSize={handleArtworkSizeFor("back")}
            />
          ) : null}

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Mockup</h3>
                <p className="text-xs text-muted-foreground">
                  Uses front artwork and placement. Printful returns multiple
                  product views (including back camera angles).
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={
                  isPending ||
                  mockupStatus === "pending" ||
                  !artworkUrls.front ||
                  providerKey !== "printful"
                }
                onClick={() => {
                  void handleGenerateMockup();
                }}
              >
                {mockupStatus === "pending"
                  ? "Generating…"
                  : "Generate mockup"}
              </Button>
            </div>

            {providerKey !== "printful" ? (
              <p className="text-xs text-muted-foreground">
                Mockup generation is available when Printful is the fulfillment
                provider.
              </p>
            ) : null}

            {mockupStatus === "pending" ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
                <span>Waiting for Printful mockup…</span>
                {mockupProgress ? (
                  <span className="text-xs">{mockupProgress}</span>
                ) : null}
              </div>
            ) : null}

            {mockupError ? (
              <p className="text-sm text-destructive">{mockupError}</p>
            ) : null}

            {mockupUrls.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {mockupUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt="Product mockup"
                    className="w-full rounded-lg border bg-muted/20 object-contain"
                  />
                ))}
              </div>
            ) : mockupStatus === "idle" && providerKey === "printful" ? (
              <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                Generate a mockup to see Printful product views here.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {validation.status === "invalid" ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-medium text-destructive">{validation.message}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Auto Fix creates a provider-specific version. Your master design is
            never overwritten.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={handleAutoFix}
            >
              Auto Fix
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setValidation({ status: "idle" })}
            >
              Adjust Manually
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => setValidation({ status: "idle" })}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {proposedAdjustment?.status === "proposed" ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Proposed fix</Badge>
            <p className="text-sm font-medium">
              Review the provider-specific adjustment on the canvas.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={handleApproveFix}
            >
              Approve & Sync
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setProposedAdjustment(null);
                setValidation({ status: "idle" });
              }}
            >
              Keep Editing
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={handleRevertFix}
            >
              Revert
            </Button>
          </div>
        </div>
      ) : null}

      {proposedAdjustment?.status === "approved" ? (
        <p className="text-sm text-muted-foreground">
          An approved provider-specific adjustment is stored separately from the
          master design. Real channel sync arrives in a later phase.
        </p>
      ) : null}

      {validation.status === "valid" ? (
        <p className="text-sm text-green-700 dark:text-green-400">
          {activeSide === "back" ? "Back" : "Front"} design validates against
          this provider&apos;s printable area.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={isPending} onClick={handleSaveDesign}>
          {isPending ? "Saving…" : "Save Design"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !artworkUrls[activeSide]}
          onClick={handleValidate}
        >
          Validate {activeSide === "back" ? "Back" : "Front"}
        </Button>
      </div>
    </div>
  );
}
