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

export function ChannelStatusCards({
  channels,
}: {
  channels: ChannelStatus[];
}) {
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
          <CardContent>
            <Button variant="outline" size="sm" disabled>
              {channel.canUpdate
                ? "Update"
                : channel.canPublish
                  ? "Publish"
                  : "Unavailable"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Real publish and sync actions arrive with marketplace connectors.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
