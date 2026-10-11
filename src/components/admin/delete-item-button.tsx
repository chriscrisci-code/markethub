"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DeleteItemButton({
  itemId,
  itemName,
}: {
  itemId: string;
  itemName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete “${itemName}” from Market Hub? Its Etsy draft is removed too. A listing that is already live on Etsy is left alone.`
    );
    if (!confirmed || pending) return;

    setPending(true);
    try {
      const response = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(json?.error ?? "Could not delete this item.");
        return;
      }
      toast.success("Item deleted.");
      router.push("/items");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        void handleDelete();
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
