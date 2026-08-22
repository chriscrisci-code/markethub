"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  publishToChannel,
  unpublishFromChannel,
  updateOnChannel,
} from "@/lib/actions/channels";
import type { ChannelStatus } from "@/lib/connectors/marketplace/types";

function statusLabel(status: ChannelStatus["syncStatus"]) {
  switch (status) {
    case "published":
      return "Published";
    case "sync_pending":
      return "Sync Pending";
    case "sync_error":
      return "Sync Error";
    default:
      return "Not Published";
  }
}

function statusVariant(status: ChannelStatus["syncStatus"]) {
  switch (status) {
    case "published":
      return "default" as const;
    case "sync_error":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function channelHint(connectorKey: string) {
  if (connectorKey === "market-hub-store") {
    return "Marks this item as available on your Market Hub Store channel (storefront UI comes later).";
  }
  if (connectorKey === "mock-marketplace") {
    return "Simulates publishing to an external marketplace. Real Etsy/Meta connectors replace this later.";
  }
  return "Publishes the master item to this sales channel.";
}

export function ChannelStatusCards({
  itemId,
  channels,
}: {
  itemId: string;
  channels: ChannelStatus[];
}) {
  const [isPending, startTransition] = useTransition();

  function runAction(
    action: "publish" | "update" | "unpublish",
    connectorKey: string,
    displayName: string
  ) {
    startTransition(async () => {
      const result =
        action === "publish"
          ? await publishToChannel(itemId, connectorKey)
          : action === "update"
            ? await updateOnChannel(itemId, connectorKey)
            : await unpublishFromChannel(itemId, connectorKey);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (action === "publish") {
        toast.success(`Published to ${displayName}.`);
      } else if (action === "update") {
        toast.success(`Updated on ${displayName}.`);
      } else {
        toast.success(`Unpublished from ${displayName}.`);
      }
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {channels.map((channel) => (
        <Card key={channel.connectorKey}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{channel.displayName}</CardTitle>
              <Badge variant={statusVariant(channel.syncStatus)}>
                {statusLabel(channel.syncStatus)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {channel.canPublish ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    runAction(
                      "publish",
                      channel.connectorKey,
                      channel.displayName
                    )
                  }
                >
                  {channel.syncStatus === "sync_error"
                    ? "Retry Publish"
                    : "Publish"}
                </Button>
              ) : null}

              {channel.canUpdate ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      runAction(
                        "update",
                        channel.connectorKey,
                        channel.displayName
                      )
                    }
                  >
                    Update
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      runAction(
                        "unpublish",
                        channel.connectorKey,
                        channel.displayName
                      )
                    }
                  >
                    Unpublish
                  </Button>
                </>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {channelHint(channel.connectorKey)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
