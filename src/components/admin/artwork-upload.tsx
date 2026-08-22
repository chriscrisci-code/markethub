"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadArtwork } from "@/lib/actions/items";

export function ArtworkUpload({
  itemId,
  artworkUrl,
  filename,
}: {
  itemId: string;
  artworkUrl: string | null;
  filename: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);

  function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please drop an image file.");
      return;
    }

    const formData = new FormData();
    formData.set("artwork", file);

    startTransition(async () => {
      const result = await uploadArtwork(itemId, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Artwork uploaded.");
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
    <div className="space-y-4">
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
          "flex min-h-48 cursor-pointer items-center justify-center rounded-xl border border-dashed bg-muted/30 p-6 transition-colors",
          isDragging && "border-foreground bg-muted",
          isPending && "pointer-events-none opacity-60"
        )}
      >
        {artworkUrl && !isDragging ? (
          <Image
            src={artworkUrl}
            alt={filename ?? "Artwork"}
            width={240}
            height={240}
            className="max-h-48 w-auto rounded-lg object-contain"
            unoptimized
          />
        ) : (
          <div className="pointer-events-none text-center text-sm text-muted-foreground">
            <Upload className="mx-auto mb-2 size-8 opacity-50" />
            {isDragging
              ? "Drop artwork to upload"
              : isPending
                ? "Uploading..."
                : "Drag and drop artwork, or click to choose a file."}
          </div>
        )}
      </div>

      {filename ? (
        <p className="text-sm text-muted-foreground">Current file: {filename}</p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        name="artwork"
        accept="image/*"
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
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        {isPending ? "Uploading..." : "Choose Artwork"}
      </Button>
    </div>
  );
}
