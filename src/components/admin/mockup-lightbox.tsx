"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Full-viewport viewer for the highest-resolution mockup available. */
export function MockupLightbox({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Mockup full resolution"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full max-w-full flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/80">
            Highest available resolution · Esc or click outside to close
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              Open in new tab
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Mockup full resolution"
          className="max-h-[calc(100vh-5rem)] max-w-[min(100vw-2rem,1600px)] object-contain"
        />
      </div>
    </div>
  );
}
