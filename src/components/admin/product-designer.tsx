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
import { DEFAULT_PLACEMENT, estimateMarginCents, fitPlacementToArea } from "@/lib/domain/design";
import { formatCents } from "@/lib/domain/format";
import { fetchProviderTemplate } from "@/lib/actions/templates";
import type { ProviderProduct, ProviderTemplate } from "@/lib/connectors/fulfillment/types";
import type {
  DesignPlacement,
  ItemDesign,
  ItemVariant,
  PrintableAreaState,
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
  artworkUrl,
  products,
  initialDesign,
  initialVariants,
  initialAdjustments,
}: {
  itemId: string;
  providerKey: string;
  salePriceCents: number;
  artworkUrl: string | null;
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

  const initialArea = initialDesign?.printable_area;
  const [placement, setPlacement] = useState<DesignPlacement>(
    initialArea?.placement ?? DEFAULT_PLACEMENT
  );
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
  const [artworkSize, setArtworkSize] = useState({ width: 0, height: 0 });
  const [validation, setValidation] = useState<ValidationState>({
    status: "idle",
  });
  const [proposedAdjustment, setProposedAdjustment] =
    useState<ProviderDesignAdjustmentRow | null>(
      initialAdjustments.find((a) => a.status === "proposed") ?? null
    );
  const [template, setTemplate] = useState<ProviderTemplate | null>(null);

  const printableArea = selectedProduct?.printableAreas[0] ?? null;

  useEffect(() => {
    if (!selectedProduct || !printableArea) {
      setTemplate(null);
      return;
    }

    let cancelled = false;
    void fetchProviderTemplate(
      providerKey,
      selectedProduct.id,
      printableArea.id,
      selectedColors[0]
    ).then((result) => {
      if (!cancelled) {
        setTemplate(result.template);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [providerKey, selectedProduct, printableArea, selectedColors]);

  const marginCents = useMemo(() => {
    if (!selectedProduct) return null;
    return estimateMarginCents(salePriceCents, selectedProduct.baseCostCents);
  }, [salePriceCents, selectedProduct]);

  const handleArtworkSize = useCallback(
    (width: number, height: number) => {
      setArtworkSize({ width, height });
      void updateArtworkDimensions(itemId, width, height);
    },
    [itemId]
  );

  function handleProductChange(productId: string) {
    const product = products.find((p) => p.id === productId);
    setSelectedProductId(productId);
    setValidation({ status: "idle" });
    setProposedAdjustment(null);

    if (product) {
      setSelectedColors(product.colors.slice(0, 1));
      setSelectedSizes(product.sizes.slice(0, 2));
      const area = product.printableAreas[0];
      if (area && artworkSize.width > 0) {
        setPlacement(
          fitPlacementToArea(
            artworkSize.width,
            artworkSize.height,
            area.widthPx,
            area.heightPx
          )
        );
      } else {
        setPlacement(DEFAULT_PLACEMENT);
      }
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

  function buildPrintableAreaState(): PrintableAreaState | null {
    if (!printableArea) return null;
    return {
      areaId: printableArea.id,
      label: printableArea.label,
      widthPx: printableArea.widthPx,
      heightPx: printableArea.heightPx,
      widthInches: printableArea.widthInches,
      heightInches: printableArea.heightInches,
      placement,
    };
  }

  function buildProductRef(): ProviderProductRef | null {
    if (!selectedProduct || !printableArea) return null;
    return {
      id: selectedProduct.id,
      name: selectedProduct.name,
      category: selectedProduct.category,
      baseCostCents: selectedProduct.baseCostCents,
      areaId: printableArea.id,
    };
  }

  function handleSaveDesign() {
    const productRef = buildProductRef();
    const area = buildPrintableAreaState();
    if (!productRef || !area) {
      toast.error("Choose a product first.");
      return;
    }

    startTransition(async () => {
      const result = await saveItemDesign(itemId, {
        providerProductRef: productRef,
        printableArea: area,
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
      // Save current design first so validation uses latest placement
      const productRef = buildProductRef();
      const area = buildPrintableAreaState();
      if (productRef && area) {
        await saveItemDesign(itemId, {
          providerProductRef: productRef,
          printableArea: area,
        });
      }

      const result = await validateItemDesign(itemId);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.valid) {
        setValidation({ status: "valid" });
        toast.success("Design looks good for this provider.");
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
      const result = await proposeDesignAutoFix(itemId);
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

  if (!selectedProduct || !printableArea) {
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
              Max print: {printableArea.label} · {printableArea.widthInches}
              &quot; × {printableArea.heightInches}&quot; (
              {printableArea.widthPx} × {printableArea.heightPx} px)
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
                    onClick={() =>
                      toggleValue(selectedColors, color, setSelectedColors)
                    }
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

        <PlacementCanvas
          artworkUrl={artworkUrl}
          areaWidthPx={printableArea.widthPx}
          areaHeightPx={printableArea.heightPx}
          areaWidthInches={printableArea.widthInches}
          areaHeightInches={printableArea.heightInches}
          placement={placement}
          template={template}
          previewPlacement={
            proposedAdjustment?.status === "proposed"
              ? (proposedAdjustment.adjustment as DesignPlacement)
              : null
          }
          onChange={setPlacement}
          onArtworkSize={handleArtworkSize}
        />
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
          Design validates against this provider&apos;s printable area.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={isPending} onClick={handleSaveDesign}>
          {isPending ? "Saving…" : "Save Design"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !artworkUrl}
          onClick={handleValidate}
        >
          Validate Design
        </Button>
      </div>
    </div>
  );
}
