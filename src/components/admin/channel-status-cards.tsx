"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChannelStatus } from "@/lib/connectors/marketplace/types";

function statusLabel(channel: ChannelStatus) {
  if (channel.connectorKey === "etsy") {
    if (channel.publicationState === "draft_ready") return "Draft on Etsy";
    if (channel.publicationState === "partially_synchronized") return "Draft incomplete";
    if (channel.publicationState === "publishing") return "Sending draft";
  }
  switch (channel.syncStatus) {
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

function statusVariant(channel: ChannelStatus) {
  if (channel.publicationState === "draft_ready") return "default" as const;
  if (
    channel.publicationState === "partially_synchronized" ||
    channel.syncStatus === "sync_error"
  ) {
    return "destructive" as const;
  }
  if (channel.syncStatus === "published") return "default" as const;
  return "secondary" as const;
}

function channelHint(connectorKey: string) {
  if (connectorKey === "etsy") {
    return "Publish draft sends this item to Etsy as a draft. It is not for sale until you make it live in Etsy. Clicking again updates the same draft.";
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
        error?: unknown;
        warning?: string;
      } | null;
      if (!response.ok) {
        const message =
          typeof json?.error === "string"
            ? json.error
            : json?.error
              ? JSON.stringify(json.error)
              : "Channel action failed.";
        toast.error(message);
        router.refresh();
        return;
      }
      if (channel.connectorKey === "etsy" && action !== "unpublish") {
        toast.success(
          json?.warning ||
            `Draft saved on ${channel.displayName}. It is not for sale yet. Check the price and photos before making it live.`
        );
      } else if (action === "publish") {
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
              <Badge variant={statusVariant(channel)}>
                {statusLabel(channel)}
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
                    {channel.connectorKey === "etsy" ? "Update draft" : "Update"}
                  </Button>
                  {channel.connectorKey === "etsy" ? null : (
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
                  )}
                </>
              ) : null}
            </div>
            {channel.listingUrl ? (
              <a
                className="text-sm underline"
                href={channel.listingUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open draft on Etsy
              </a>
            ) : null}
            {channel.syncError ? (
              <p className="text-xs text-destructive">{channel.syncError}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {channelHint(channel.connectorKey)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
