"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

const RULER = 28;
const MAX_STAGE_WIDTH = 420;

function useHtmlImage(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    img.src = url;
  }, [url]);

  return image;
}

function formatInches(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}"`;
}

function buildTickValues(
  lengthInches: number,
  originInches: number,
  majorStep = 1
): number[] {
  const start = Math.floor(-originInches) - 1;
  const end = Math.ceil(lengthInches - originInches) + 1;
  const ticks: number[] = [];
  for (let i = start; i <= end; i += majorStep) {
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
  onChange: (placement: DesignPlacement) => void;
  onArtworkSize?: (width: number, height: number) => void;
}) {
  const activePlacement = previewPlacement ?? placement;
  const image = useHtmlImage(artworkUrl);
  const imageRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);

  const viewScale = Math.min(MAX_STAGE_WIDTH / areaWidthPx, 1);
  const stageWidth = areaWidthPx * viewScale;
  const stageHeight = areaHeightPx * viewScale;
  const pxPerInchX = stageWidth / areaWidthInches;
  const pxPerInchY = stageHeight / areaHeightInches;

  // Origin (0,0) in stage pixels — draggable via rulers
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);

  const [measureMode, setMeasureMode] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [draggingAxis, setDraggingAxis] = useState<"x" | "y" | null>(null);

  const artworkNatural = useMemo(() => {
    if (!image) return { width: 0, height: 0 };
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, [image]);

  useEffect(() => {
    if (image && onArtworkSize) {
      onArtworkSize(image.naturalWidth, image.naturalHeight);
    }
  }, [image, onArtworkSize]);

  useEffect(() => {
    if (imageRef.current && transformerRef.current && !previewPlacement) {
      transformerRef.current.nodes([imageRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [image, previewPlacement, activePlacement]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Shift" || event.key === "Alt") {
        setMeasureMode(true);
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === "Shift" || event.key === "Alt") {
        // Keep measure mode if the other modifier is still held
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

  useEffect(() => {
    if (!draggingAxis) return;

    function onMove(event: PointerEvent) {
      const wrap = stageWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();

      if (draggingAxis === "x") {
        const x = Math.min(
          Math.max(event.clientX - rect.left - RULER, 0),
          stageWidth
        );
        setOriginX(x);
      } else {
        const y = Math.min(
          Math.max(event.clientY - rect.top - RULER, 0),
          stageHeight
        );
        setOriginY(y);
      }
    }

    function onUp() {
      setDraggingAxis(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingAxis, stageWidth, stageHeight]);

  const resetOrigin = useCallback(() => {
    setOriginX(0);
    setOriginY(0);
  }, []);

  if (!artworkUrl) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Upload artwork to position it on the product.
      </div>
    );
  }

  const drawnWidth = activePlacement.scale * stageWidth;
  const aspect =
    artworkNatural.width > 0
      ? artworkNatural.height / artworkNatural.width
      : 1;
  const drawnHeight = drawnWidth * aspect;
  const x = activePlacement.x * stageWidth;
  const y = activePlacement.y * stageHeight;

  function syncFromNode(node: Konva.Image) {
    const width = node.width() * node.scaleX();
    const next: DesignPlacement = {
      x: node.x() / stageWidth,
      y: node.y() / stageHeight,
      scale: width / stageWidth,
      rotation: node.rotation(),
    };
    node.scaleX(1);
    node.scaleY(1);
    node.width(width);
    node.height(width * aspect);
    onChange(next);
  }

  const originInchesX = originX / pxPerInchX;
  const originInchesY = originY / pxPerInchY;
  const hTicks = buildTickValues(areaWidthInches, originInchesX);
  const vTicks = buildTickValues(areaHeightInches, originInchesY);

  const cursorInches =
    cursor && measureMode
      ? {
          x: (cursor.x - originX) / pxPerInchX,
          y: (cursor.y - originY) / pxPerInchY,
        }
      : null;

  return (
    <div className="space-y-2">
      <div
        ref={stageWrapRef}
        className="inline-block overflow-hidden rounded-xl border bg-muted/20 select-none"
        style={{ width: stageWidth + RULER }}
      >
        {/* Ruler chrome */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${RULER}px ${stageWidth}px`,
            gridTemplateRows: `${RULER}px ${stageHeight}px`,
          }}
        >
          {/* Corner */}
          <button
            type="button"
            title="Reset origin to top-left"
            onClick={resetOrigin}
            className="flex items-center justify-center border-b border-r bg-muted text-[10px] font-medium text-muted-foreground hover:bg-muted/80"
          >
            0,0
          </button>

          {/* Top ruler */}
          <div
            className={cn(
              "relative border-b bg-muted/60",
              draggingAxis === "x" ? "cursor-ew-resize" : "cursor-ew-resize"
            )}
            onPointerDown={(event) => {
              event.preventDefault();
              setDraggingAxis("x");
              const rect = event.currentTarget.getBoundingClientRect();
              const xPos = Math.min(
                Math.max(event.clientX - rect.left, 0),
                stageWidth
              );
              setOriginX(xPos);
            }}
          >
            <svg width={stageWidth} height={RULER} className="block">
              {hTicks.map((tick) => {
                const sx = originX + tick * pxPerInchX;
                if (sx < -1 || sx > stageWidth + 1) return null;
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
                      fontFamily="ui-sans-serif, system-ui"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}
              {/* minor 0.25" ticks */}
              {Array.from({ length: Math.ceil(areaWidthInches * 4) + 8 }).map(
                (_, i) => {
                  const value = i * 0.25 - Math.ceil(originInchesX) - 1;
                  if (Number.isInteger(value)) return null;
                  const sx = originX + value * pxPerInchX;
                  if (sx < 0 || sx > stageWidth) return null;
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
                }
              )}
            </svg>
            {/* Draggable origin handle on top ruler */}
            <div
              className="absolute top-0 z-10 -translate-x-1/2"
              style={{ left: originX }}
              title="Drag to move horizontal zero"
            >
              <div className="h-full w-3 cursor-ew-resize border-x-2 border-foreground/70 bg-foreground/10" style={{ height: RULER }} />
            </div>
          </div>

          {/* Left ruler */}
          <div
            className="relative border-r bg-muted/60 cursor-ns-resize"
            onPointerDown={(event) => {
              event.preventDefault();
              setDraggingAxis("y");
              const rect = event.currentTarget.getBoundingClientRect();
              const yPos = Math.min(
                Math.max(event.clientY - rect.top, 0),
                stageHeight
              );
              setOriginY(yPos);
            }}
          >
            <svg width={RULER} height={stageHeight} className="block">
              {vTicks.map((tick) => {
                const sy = originY + tick * pxPerInchY;
                if (sy < -1 || sy > stageHeight + 1) return null;
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
                      fontFamily="ui-sans-serif, system-ui"
                      transform={`rotate(-90, 10, ${sy - 3})`}
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}
              {Array.from({ length: Math.ceil(areaHeightInches * 4) + 8 }).map(
                (_, i) => {
                  const value = i * 0.25 - Math.ceil(originInchesY) - 1;
                  if (Number.isInteger(value)) return null;
                  const sy = originY + value * pxPerInchY;
                  if (sy < 0 || sy > stageHeight) return null;
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
                }
              )}
            </svg>
            <div
              className="absolute left-0 z-10 -translate-y-1/2"
              style={{ top: originY }}
              title="Drag to move vertical zero"
            >
              <div className="h-3 w-full cursor-ns-resize border-y-2 border-foreground/70 bg-foreground/10" style={{ width: RULER }} />
            </div>
          </div>

          {/* Stage */}
          <div
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
            <Stage width={stageWidth} height={stageHeight}>
              <Layer>
                <Rect
                  x={0}
                  y={0}
                  width={stageWidth}
                  height={stageHeight}
                  fill="#f4f4f5"
                  stroke="#a1a1aa"
                  dash={[6, 4]}
                />

                {/* Origin zero guides */}
                <Line
                  points={[originX, 0, originX, stageHeight]}
                  stroke="#27272a"
                  strokeWidth={1}
                  opacity={0.35}
                  dash={[4, 4]}
                />
                <Line
                  points={[0, originY, stageWidth, originY]}
                  stroke="#27272a"
                  strokeWidth={1}
                  opacity={0.35}
                  dash={[4, 4]}
                />

                {image ? (
                  <KonvaImage
                    ref={imageRef}
                    image={image}
                    x={x}
                    y={y}
                    width={drawnWidth}
                    height={drawnHeight}
                    rotation={activePlacement.rotation}
                    draggable={!previewPlacement && !measureMode}
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

                {/* Measure crosshairs */}
                {measureMode && cursor ? (
                  <>
                    <Line
                      points={[cursor.x, 0, cursor.x, stageHeight]}
                      stroke="#dc2626"
                      strokeWidth={1}
                      listening={false}
                    />
                    <Line
                      points={[0, cursor.y, stageWidth, cursor.y]}
                      stroke="#dc2626"
                      strokeWidth={1}
                      listening={false}
                    />
                    <Text
                      x={Math.min(cursor.x + 8, stageWidth - 90)}
                      y={Math.max(cursor.y - 28, 4)}
                      text={`${formatInches(cursorInches?.x ?? 0)} , ${formatInches(cursorInches?.y ?? 0)}`}
                      fontSize={11}
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

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Print area {areaWidthInches}&quot; × {areaHeightInches}&quot;. Drag
          top/side rulers to move 0,0. Corner resets origin.
        </p>
        <p>
          Hold <kbd className="rounded border px-1">Shift</kbd> or{" "}
          <kbd className="rounded border px-1">Alt</kbd> for measuring
          crosshairs (inches from origin).
          {previewPlacement
            ? " Showing proposed provider fix (master design unchanged)."
            : null}
        </p>
      </div>
    </div>
  );
}
