"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  refreshFulfillmentStatus,
  sendOrderToFulfillment,
} from "@/lib/actions/orders";

export function OrderActions({
  orderId,
  status,
  hasFulfillmentJob,
}: {
  orderId: string;
  status: string;
  hasFulfillmentJob: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const canFulfill =
    !hasFulfillmentJob &&
    (status === "pending" || status === "processing");

  const canRefresh = hasFulfillmentJob && status !== "fulfilled";

  return (
    <div className="flex flex-wrap gap-2">
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
