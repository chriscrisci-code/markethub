"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  if (connectorKey === "etsy") {
    return "Reconnect this shop after Etsy listing permission is added. Publish creates a draft only, and only after you approve the first live write.";
  }
  if (connectorKey === "market-hub-store") {
    return "Your Market Hub storefront. Storefront checkout comes later.";
  }
  if (connectorKey === "mock-marketplace") {
    return "Simulated external shop for testing the hub.";
  }
  return "Publishes this item to this storefront.";
}

export function ChannelStatusCards({
  itemId,
  channels,
}: {
  itemId: string;
  channels: ChannelStatus[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function runAction(
    action: "publish" | "update" | "unpublish",
    channel: ChannelStatus
  ) {
    setBusyId(channel.connectionId);
    try {
      const response = await fetch(`/api/items/${itemId}/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: channel.connectionId,
          action,
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        variantCount?: number;
        imageCount?: number;
      } | null;
      if (!response.ok) {
        if (json?.code === "approval_required") {
          toast.message(
            json.error ??
              `Draft is ready (${json.variantCount ?? 0} variants, ${json.imageCount ?? 0} images). Live Etsy write is waiting for approval.`
          );
          return;
        }
        toast.error(json?.error ?? "Channel action failed.");
        return;
      }
      if (action === "publish") {
        toast.success(`Published to ${channel.displayName}.`);
      } else if (action === "update") {
        toast.success(`Updated on ${channel.displayName}.`);
      } else {
        toast.success(`Unpublished from ${channel.displayName}.`);
      }
      router.refresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  if (channels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No storefronts yet. Add an Etsy shop or other storefront from Storefronts.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {channels.map((channel) => (
        <Card key={channel.connectionId}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">{channel.displayName}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {channel.platformName}
                </p>
              </div>
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
                  disabled={busyId === channel.connectionId}
                  onClick={() => {
                    void runAction("publish", channel);
                  }}
                >
                  {channel.connectorKey === "etsy"
                    ? channel.syncStatus === "sync_error"
                      ? "Retry draft"
                      : "Publish draft"
                    : channel.syncStatus === "sync_error"
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
                    disabled={busyId === channel.connectionId}
                    onClick={() => {
                      void runAction("update", channel);
                    }}
                  >
                    Update
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busyId === channel.connectionId}
                    onClick={() => {
                      void runAction("unpublish", channel);
                    }}
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
