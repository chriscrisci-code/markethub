"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  refreshFulfillmentStatus,
  sendOrderToFulfillment,
} from "@/lib/actions/orders";

export function OrderStatusActions({
  orderId,
  status,
  archived = false,
}: {
  orderId: string;
  status: string;
  archived?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"fulfill" | "archive" | null>(null);

  async function run(action: "fulfill" | "archive" | "unarchive") {
    if (pending) return;
    setPending(action === "fulfill" ? "fulfill" : "archive");
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(json?.error ?? "Could not update this order.");
        return;
      }
      toast.success(
        action === "fulfill"
          ? "Order marked fulfilled."
          : action === "archive"
            ? "Order archived."
            : "Order restored."
      );
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "fulfilled" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={() => {
            void run("fulfill");
          }}
        >
          {pending === "fulfill" ? "Saving…" : "Mark fulfilled"}
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending !== null}
        onClick={() => {
          void run(archived ? "unarchive" : "archive");
        }}
      >
        {pending === "archive" ? "Saving…" : archived ? "Unarchive" : "Archive"}
      </Button>
    </div>
  );
}

export function OrderActions({
  orderId,
  status,
  hasFulfillmentJob,
  archived = false,
}: {
  orderId: string;
  status: string;
  hasFulfillmentJob: boolean;
  archived?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const canFulfill =
    !hasFulfillmentJob &&
    (status === "pending" || status === "processing");

  const canRefresh = hasFulfillmentJob && status !== "fulfilled";

  return (
    <div className="flex flex-wrap gap-2">
      <OrderStatusActions orderId={orderId} status={status} archived={archived} />
      {canFulfill ? (
        <Button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const result = await sendOrderToFulfillment(orderId);
              if (result.error) {
                toast.error(result.error);
              } else {
                toast.success("Sent to fulfillment provider.");
              }
            });
          }}
        >
          {isPending ? "Sending…" : "Send to Fulfillment"}
        </Button>
      ) : null}

      {canRefresh || (hasFulfillmentJob && status === "processing") ? (
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const result = await refreshFulfillmentStatus(orderId);
              if (result.error) {
                toast.error(result.error);
              } else {
                toast.success(
                  result.status === "shipped"
                    ? "Order shipped — tracking updated."
                    : `Fulfillment status: ${result.status}`
                );
              }
            });
          }}
        >
          {isPending ? "Refreshing…" : "Refresh Fulfillment Status"}
        </Button>
      ) : null}
    </div>
  );
}
