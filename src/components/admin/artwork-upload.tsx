"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearArtwork, uploadArtwork } from "@/lib/actions/items";
import type { ArtworkSide } from "@/lib/types/database";

export function ArtworkUpload({
  itemId,
  side = "front",
  label,
  artworkUrl,
  filename,
}: {
  itemId: string;
  side?: ArtworkSide;
  label?: string;
  artworkUrl: string | null;
  filename: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const title = label ?? (side === "back" ? "Back" : "Front");

  const ALLOWED_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
  ]);

  function uploadFile(file: File) {
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error("Use a PNG or JPG file. Printful mockups reject WebP, HEIC, and SVG.");
      return;
    }

    const formData = new FormData();
    formData.set("artwork", file);

    startTransition(async () => {
      const result = await uploadArtwork(itemId, formData, side);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${title} artwork uploaded.`);
      }
    });
  }

  function handleClear(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    startTransition(async () => {
      const result = await clearArtwork(itemId, side);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${title} artwork cleared.`);
      }
    });
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDragEnter(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      uploadFile(file);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        {artworkUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={handleClear}
            className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !isPending && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex min-h-36 cursor-pointer items-center justify-center rounded-xl border border-dashed bg-muted/30 p-4 transition-colors",
          isDragging && "border-foreground bg-muted",
          isPending && "pointer-events-none opacity-60"
        )}
      >
        {artworkUrl && !isDragging ? (
          <Image
            src={artworkUrl}
            alt={filename ?? `${title} artwork`}
            width={200}
            height={200}
            className="max-h-36 w-auto rounded-lg object-contain"
            unoptimized
          />
        ) : (
          <div className="pointer-events-none text-center text-sm text-muted-foreground">
            <Upload className="mx-auto mb-2 size-6 opacity-50" />
            {isDragging
              ? "Drop to upload"
              : isPending
                ? "Uploading..."
                : `Drop or click for ${title.toLowerCase()} art (PNG/JPG)`}
          </div>
        )}
      </div>

      {filename ? (
        <p className="text-xs text-muted-foreground truncate">{filename}</p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        name="artwork"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            uploadFile(file);
            event.target.value = "";
          }
        }}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        {isPending ? "Working..." : `Choose ${title}`}
      </Button>
    </div>
  );
}
