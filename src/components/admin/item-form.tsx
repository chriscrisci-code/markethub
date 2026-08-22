"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateItem } from "@/lib/actions/items";
import type { ConnectorRegistry, Item } from "@/lib/types/database";
import { formatCents } from "@/lib/domain/format";

export function ItemForm({
  item,
  fulfillmentProviders,
}: {
  item: Item;
  fulfillmentProviders: ConnectorRegistry[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateItem(item.id, formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Item saved.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={item.name} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={item.description}
          rows={4}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <Input
            id="price"
            name="price"
            defaultValue={(item.base_price_cents / 100).toFixed(2)}
            inputMode="decimal"
          />
          <p className="text-xs text-muted-foreground">
            Current: {formatCents(item.base_price_cents)}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={item.status}
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fulfillment_provider_key">Fulfillment Provider</Label>
        <select
          id="fulfillment_provider_key"
          name="fulfillment_provider_key"
          defaultValue={item.fulfillment_provider_key ?? ""}
          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Choose a provider</option>
          {fulfillmentProviders.map((provider) => (
            <option key={provider.key} value={provider.key}>
              {provider.display_name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
