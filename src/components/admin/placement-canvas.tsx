"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Line,
  Text,
  Image as KonvaImage,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import type { DesignPlacement } from "@/lib/types/database";
import type { ProviderTemplate } from "@/lib/connectors/fulfillment/types";
import { cn } from "@/lib/utils";

const RULER = 28;
const MAX_VIEW_WIDTH = 460;

function useHtmlImage(url: string | null, { cors = true }: { cors?: boolean } = {}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    // Provider template CDNs often omit CORS headers; skip for display-only overlays.
    if (cors) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    img.src = url;
  }, [url, cors]);

  return image;
}

function formatInches(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}"`;
}

function buildTickValues(lengthInches: number, majorStep = 1): number[] {
  const end = Math.ceil(lengthInches);
  const ticks: number[] = [];
  for (let i = 0; i <= end; i += majorStep) {
    ticks.push(i);
  }
  return ticks;
}

export function PlacementCanvas({
  artworkUrl,
  areaWidthPx,
  areaHeightPx,
  areaWidthInches,
  areaHeightInches,
  placement,
  previewPlacement,
  template,
  garmentColorHex,
  title = "Placement",
  onChange,
  onArtworkSize,
}: {
  artworkUrl: string | null;
  areaWidthPx: number;
  areaHeightPx: number;
  areaWidthInches: number;
  areaHeightInches: number;
  placement: DesignPlacement;
  previewPlacement?: DesignPlacement | null;
  template?: ProviderTemplate | null;
  /** Hex from provider (e.g. Printful color_code); tint applies only on opaque garment pixels. */
  garmentColorHex?: string | null;
  title?: string;
  onChange: (placement: DesignPlacement) => void;
  onArtworkSize?: (width: number, height: number) => void;
}) {
  const activePlacement = previewPlacement ?? placement;
  const artwork = useHtmlImage(artworkUrl);
  const templateImage = useHtmlImage(template?.imageUrl ?? null, {
    cors: false,
  });
  const imageRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const [measureMode, setMeasureMode] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  // Layout: either print-area-only stage, or full template with print area region
  const hasTemplate = Boolean(template && templateImage);

  const display = useMemo(() => {
    if (hasTemplate && template) {
      const scale = Math.min(MAX_VIEW_WIDTH / template.templateWidth, 1);
      return {
        mode: "template" as const,
        scale,
        stageWidth: template.templateWidth * scale,
        stageHeight: template.templateHeight * scale,
        printLeft: template.printAreaLeft * scale,
        printTop: template.printAreaTop * scale,
        printWidth: template.printAreaWidth * scale,
        printHeight: template.printAreaHeight * scale,
      };
    }

    const scale = Math.min(MAX_VIEW_WIDTH / areaWidthPx, 1);
    const stageWidth = areaWidthPx * scale;
    const stageHeight = areaHeightPx * scale;
    return {
      mode: "area" as const,
      scale,
      stageWidth,
      stageHeight,
      printLeft: 0,
      printTop: 0,
      printWidth: stageWidth,
      printHeight: stageHeight,
    };
  }, [hasTemplate, template, areaWidthPx, areaHeightPx]);

  const pxPerInchX = display.printWidth / areaWidthInches;
  const pxPerInchY = display.printHeight / areaHeightInches;

  const artworkNatural = useMemo(() => {
    if (!artwork) return { width: 0, height: 0 };
    return { width: artwork.naturalWidth, height: artwork.naturalHeight };
  }, [artwork]);

  useEffect(() => {
    if (artwork && onArtworkSize) {
      onArtworkSize(artwork.naturalWidth, artwork.naturalHeight);
    }
  }, [artwork, onArtworkSize]);

  useEffect(() => {
    if (imageRef.current && transformerRef.current && !previewPlacement) {
      transformerRef.current.nodes([imageRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [artwork, previewPlacement, activePlacement, display]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Shift" || event.key === "Alt") {
        setMeasureMode(true);
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === "Shift" || event.key === "Alt") {
        if (!event.shiftKey && !event.altKey) {
          setMeasureMode(false);
        }
      }
    }
    function onBlur() {
      setMeasureMode(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  if (!artworkUrl) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Upload artwork to position it on the product.
      </div>
    );
  }

  const aspect =
    artworkNatural.width > 0
      ? artworkNatural.height / artworkNatural.width
      : 1;

  // Artwork position is always relative to the print area (0,0 = top-left of print area)
  const drawnWidth = activePlacement.scale * display.printWidth;
  const drawnHeight = drawnWidth * aspect;
  const artX = display.printLeft + activePlacement.x * display.printWidth;
  const artY = display.printTop + activePlacement.y * display.printHeight;

  function syncFromNode(node: Konva.Image) {
    const width = node.width() * node.scaleX();
    const next: DesignPlacement = {
      x: (node.x() - display.printLeft) / display.printWidth,
      y: (node.y() - display.printTop) / display.printHeight,
      scale: width / display.printWidth,
      rotation: node.rotation(),
    };
    node.scaleX(1);
    node.scaleY(1);
    node.width(width);
    node.height(width * aspect);
    onChange(next);
  }

  const hTicks = buildTickValues(areaWidthInches);
  const vTicks = buildTickValues(areaHeightInches);

  const cursorInPrint =
    cursor && measureMode
      ? {
          x: (cursor.x - display.printLeft) / pxPerInchX,
          y: (cursor.y - display.printTop) / pxPerInchY,
        }
      : null;

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="text-xs text-muted-foreground">
          Position artwork on the max print area. Rulers start at 0,0 (top-left).
        </p>
      </div>

      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <p className="font-medium">
          Max print area: {areaWidthInches}&quot; × {areaHeightInches}&quot;
        </p>
        <p className="text-xs text-muted-foreground">
          {areaWidthPx} × {areaHeightPx} px
          {hasTemplate ? " · Product template from provider" : null}
          {garmentColorHex ? ` · Preview color ${garmentColorHex}` : null}
        </p>
      </div>

      <div
        className="inline-block overflow-hidden rounded-xl border select-none"
        style={{
          width: display.stageWidth + RULER,
          backgroundColor: "#e4e4e7",
          backgroundImage:
            "linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
        }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${RULER}px ${display.stageWidth}px`,
            gridTemplateRows: `${RULER}px ${display.stageHeight}px`,
          }}
        >
          <div className="flex items-center justify-center border-b border-r bg-muted text-[10px] font-medium text-muted-foreground">
            0,0
          </div>

          {/* Top ruler — aligned to print area */}
          <div className="relative border-b bg-muted/60">
            <svg width={display.stageWidth} height={RULER} className="block">
              {hTicks.map((tick) => {
                const sx = display.printLeft + tick * pxPerInchX;
                if (sx < display.printLeft - 1 || sx > display.printLeft + display.printWidth + 1) {
                  return null;
                }
                const isZero = tick === 0;
                return (
                  <g key={`h-${tick}`}>
                    <line
                      x1={sx}
                      y1={isZero ? 4 : 12}
                      x2={sx}
                      y2={RULER}
                      stroke={isZero ? "#18181b" : "#71717a"}
                      strokeWidth={isZero ? 1.5 : 1}
                    />
                    <text
                      x={sx + 3}
                      y={11}
                      fill={isZero ? "#18181b" : "#52525b"}
                      fontSize={9}
                      fontFamily="Poppins, sans-serif"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}
              {Array.from({
                length: Math.ceil(areaWidthInches * 4) + 1,
              }).map((_, i) => {
                const value = i * 0.25;
                if (Number.isInteger(value) || value > areaWidthInches) return null;
                const sx = display.printLeft + value * pxPerInchX;
                return (
                  <line
                    key={`hm-${i}`}
                    x1={sx}
                    y1={18}
                    x2={sx}
                    y2={RULER}
                    stroke="#a1a1aa"
                    strokeWidth={1}
                  />
                );
              })}
            </svg>
          </div>

          {/* Left ruler — aligned to print area */}
          <div className="relative border-r bg-muted/60">
            <svg width={RULER} height={display.stageHeight} className="block">
              {vTicks.map((tick) => {
                const sy = display.printTop + tick * pxPerInchY;
                if (sy < display.printTop - 1 || sy > display.printTop + display.printHeight + 1) {
                  return null;
                }
                const isZero = tick === 0;
                return (
                  <g key={`v-${tick}`}>
                    <line
                      x1={isZero ? 4 : 12}
                      y1={sy}
                      x2={RULER}
                      y2={sy}
                      stroke={isZero ? "#18181b" : "#71717a"}
                      strokeWidth={isZero ? 1.5 : 1}
                    />
                    <text
                      x={2}
                      y={sy - 3}
                      fill={isZero ? "#18181b" : "#52525b"}
                      fontSize={9}
                      fontFamily="Poppins, sans-serif"
                      transform={`rotate(-90, 10, ${sy - 3})`}
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}
              {Array.from({
                length: Math.ceil(areaHeightInches * 4) + 1,
              }).map((_, i) => {
                const value = i * 0.25;
                if (Number.isInteger(value) || value > areaHeightInches) return null;
                const sy = display.printTop + value * pxPerInchY;
                return (
                  <line
                    key={`vm-${i}`}
                    x1={18}
                    y1={sy}
                    x2={RULER}
                    y2={sy}
                    stroke="#a1a1aa"
                    strokeWidth={1}
                  />
                );
              })}
            </svg>
          </div>

          <div
            ref={printAreaRef}
            className={cn("relative", measureMode && "cursor-crosshair")}
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setCursor({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              });
            }}
            onPointerLeave={() => setCursor(null)}
          >
            <Stage width={display.stageWidth} height={display.stageHeight}>
              {/* Template cutout; optional hex uses 'color' blend (keeps folds, shirt only) */}
              <Layer listening={false}>
                {hasTemplate && templateImage && template ? (
                  <>
                    <KonvaImage
                      image={templateImage}
                      x={0}
                      y={0}
                      width={display.stageWidth}
                      height={display.stageHeight}
                    />
                    {garmentColorHex ? (
                      <Rect
                        x={0}
                        y={0}
                        width={display.stageWidth}
                        height={display.stageHeight}
                        fill={garmentColorHex}
                        globalCompositeOperation="color"
                      />
                    ) : null}
                    {/* Fill print area with garment color; outline is drawn above */}
                    {garmentColorHex ? (
                      <Rect
                        x={display.printLeft}
                        y={display.printTop}
                        width={display.printWidth}
                        height={display.printHeight}
                        fill={garmentColorHex}
                      />
                    ) : null}
                  </>
                ) : null}
              </Layer>

              <Layer>
                {hasTemplate ? (
                  <>
                    <Rect
                      x={0}
                      y={0}
                      width={display.stageWidth}
                      height={display.printTop}
                      fill="rgba(0,0,0,0.22)"
                      listening={false}
                    />
                    <Rect
                      x={0}
                      y={display.printTop + display.printHeight}
                      width={display.stageWidth}
                      height={
                        display.stageHeight -
                        display.printTop -
                        display.printHeight
                      }
                      fill="rgba(0,0,0,0.22)"
                      listening={false}
                    />
                    <Rect
                      x={0}
                      y={display.printTop}
                      width={display.printLeft}
                      height={display.printHeight}
                      fill="rgba(0,0,0,0.22)"
                      listening={false}
                    />
                    <Rect
                      x={display.printLeft + display.printWidth}
                      y={display.printTop}
                      width={
                        display.stageWidth -
                        display.printLeft -
                        display.printWidth
                      }
                      height={display.printHeight}
                      fill="rgba(0,0,0,0.22)"
                      listening={false}
                    />
                  </>
                ) : null}

                <Rect
                  x={display.printLeft}
                  y={display.printTop}
                  width={display.printWidth}
                  height={display.printHeight}
                  stroke="#2563eb"
                  strokeWidth={2}
                  dash={[6, 4]}
                  fillEnabled={false}
                  listening={false}
                />

                <Line
                  points={[
                    display.printLeft,
                    display.printTop,
                    display.printLeft + 12,
                    display.printTop,
                  ]}
                  stroke="#18181b"
                  strokeWidth={1.5}
                  listening={false}
                />
                <Line
                  points={[
                    display.printLeft,
                    display.printTop,
                    display.printLeft,
                    display.printTop + 12,
                  ]}
                  stroke="#18181b"
                  strokeWidth={1.5}
                  listening={false}
                />

                {artwork ? (
                  <KonvaImage
                    ref={imageRef}
                    image={artwork}
                    x={artX}
                    y={artY}
                    width={drawnWidth}
                    height={drawnHeight}
                    rotation={activePlacement.rotation}
                    draggable={!previewPlacement && !measureMode}
                    dragBoundFunc={(pos) => ({
                      x: Math.min(
                        Math.max(pos.x, display.printLeft - drawnWidth * 0.5),
                        display.printLeft + display.printWidth
                      ),
                      y: Math.min(
                        Math.max(pos.y, display.printTop - drawnHeight * 0.5),
                        display.printTop + display.printHeight
                      ),
                    })}
                    onDragEnd={(event) => {
                      syncFromNode(event.target as Konva.Image);
                    }}
                    onTransformEnd={(event) => {
                      syncFromNode(event.target as Konva.Image);
                    }}
                  />
                ) : null}

                {!previewPlacement && !measureMode ? (
                  <Transformer
                    ref={transformerRef}
                    rotateEnabled
                    enabledAnchors={[
                      "top-left",
                      "top-right",
                      "bottom-left",
                      "bottom-right",
                    ]}
                    boundBoxFunc={(oldBox, newBox) => {
                      if (newBox.width < 20 || newBox.height < 20) {
                        return oldBox;
                      }
                      return newBox;
                    }}
                  />
                ) : null}

                {measureMode && cursor ? (
                  <>
                    <Line
                      points={[
                        cursor.x,
                        display.printTop,
                        cursor.x,
                        display.printTop + display.printHeight,
                      ]}
                      stroke="#dc2626"
                      strokeWidth={1}
                      listening={false}
                    />
                    <Line
                      points={[
                        display.printLeft,
                        cursor.y,
                        display.printLeft + display.printWidth,
                        cursor.y,
                      ]}
                      stroke="#dc2626"
                      strokeWidth={1}
                      listening={false}
                    />
                    <Text
                      x={Math.min(
                        cursor.x + 8,
                        display.printLeft + display.printWidth - 90
                      )}
                      y={Math.max(cursor.y - 28, display.printTop + 4)}
                      text={`${formatInches(cursorInPrint?.x ?? 0)} , ${formatInches(cursorInPrint?.y ?? 0)}`}
                      fontSize={11}
                      fontFamily="Poppins, sans-serif"
                      fill="#dc2626"
                      fontStyle="bold"
                      listening={false}
                    />
                  </>
                ) : null}
              </Layer>
            </Stage>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Blue dashed outline = maximum print area (filled with garment color).
        Hold <kbd className="rounded border px-1">Shift</kbd> or{" "}
        <kbd className="rounded border px-1">Alt</kbd> for measuring crosshairs
        (inches from print-area 0,0).
        {previewPlacement
          ? " Showing proposed provider fix (master design unchanged)."
          : null}
      </p>
    </div>
  );
}
