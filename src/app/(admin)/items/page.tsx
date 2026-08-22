import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createItem } from "@/lib/actions/items";
import { getArtworkUrl, getItems } from "@/lib/data/queries";
import { formatCents, formatPublishedTo } from "@/lib/domain/format";

async function ItemThumbnail({ storagePath }: { storagePath: string | undefined }) {
  if (!storagePath) {
    return (
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
        —
      </div>
    );
  }

  const url = await getArtworkUrl(storagePath);
  if (!url) {
    return (
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
        —
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt=""
      width={40}
      height={40}
      className="size-10 rounded-md object-cover"
      unoptimized
    />
  );
}

export default async function ItemsPage() {
  const items = await getItems();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Items</h1>
          <p className="mt-2 text-muted-foreground">
            Your master product catalog.
          </p>
        </div>
        <form action={createItem}>
          <Button type="submit">
            <Plus className="size-4" />
            Add Item
          </Button>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No items yet.</p>
          <form action={createItem} className="mt-4">
            <Button type="submit">
              <Plus className="size-4" />
              Add Item
            </Button>
          </form>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14"> </TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead>Published To</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <ItemThumbnail
                      storagePath={item.item_artwork?.storage_path}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/items/${item.id}`}
                      className="font-medium hover:underline"
                    >
                      {item.name}
                    </Link>
                  </TableCell>
                  <TableCell>{formatCents(item.base_price_cents)}</TableCell>
                  <TableCell>
                    {item.fulfillment_provider?.display_name ?? "—"}
                  </TableCell>
                  <TableCell>{formatPublishedTo(item.channel_listings)}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === "active" ? "default" : "secondary"}>
                      {item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
