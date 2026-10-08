"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type StorefrontRow = {
  id: string;
  connector_key: string;
  display_name: string;
  status: string;
  external_account_id?: string | null;
};

function statusLabel(status: string) {
  if (status === "connected") return "Connected";
  if (status === "error") return "Error";
  return "Disconnected";
}

const PLATFORMS = [
  { key: "etsy", label: "Etsy" },
  { key: "market-hub-store", label: "Market Hub Store" },
  { key: "mock-marketplace", label: "Mock Marketplace" },
];

export function StorefrontManager({
  storefronts,
  notice,
}: {
  storefronts: StorefrontRow[];
  notice?: string | null;
}) {
  const router = useRouter();
  const announced = useRef(false);
  const [displayName, setDisplayName] = useState("");
  const [connectorKey, setConnectorKey] = useState("etsy");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!notice || announced.current) return;
    announced.current = true;
    if (notice === "connected") {
      toast.success("Etsy shop connected.");
    } else if (notice === "cancelled") {
      toast.message("Etsy connection cancelled.");
    } else if (notice === "https") {
      toast.error(
        "Etsy requires an https callback. Set ETSY_REDIRECT_URI to the live site and register that URL on the Etsy app."
      );
    } else if (notice === "config") {
      toast.error("Etsy keys are missing on the server.");
    } else {
      toast.error("Could not connect this Etsy shop.");
    }
  }, [notice]);

  async function addStorefront(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/storefronts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, connectorKey }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        toast.error(json?.error ?? "Could not add storefront.");
        return;
      }
      setDisplayName("");
      toast.success("Storefront added.");
      router.refresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function removeStorefront(id: string, name: string) {
    if (!window.confirm(`Remove ${name}? Listings on this shop will be deleted.`)) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/storefronts/${id}`, { method: "DELETE" });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        toast.error(json?.error ?? "Could not remove storefront.");
        return;
      }
      toast.success("Storefront removed.");
      router.refresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a storefront</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addStorefront} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="displayName">Shop name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Etsy Shop A"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="connectorKey">Platform</Label>
              <select
                id="connectorKey"
                value={connectorKey}
                onChange={(event) => setConnectorKey(event.target.value)}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {PLATFORMS.map((platform) => (
                  <option key={platform.key} value={platform.key}>
                    {platform.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Add storefront"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Add as many shops as you need, including separate Etsy accounts.
            Etsy still collects the buyer&apos;s payment. This hub records the
            order and sends it down the item&apos;s fulfillment path.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {storefronts.map((storefront) => (
          <Card key={storefront.id}>
            <CardHeader>
              <CardTitle className="text-base">{storefront.display_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {PLATFORMS.find((p) => p.key === storefront.connector_key)?.label ??
                  storefront.connector_key}
              </p>
              <p
                className={cn(
                  "text-sm font-medium",
                  storefront.status === "connected" && "text-emerald-700",
                  storefront.status === "error" && "text-destructive",
                  storefront.status !== "connected" &&
                    storefront.status !== "error" &&
                    "text-muted-foreground"
                )}
              >
                {statusLabel(storefront.status)}
              </p>
              {storefront.connector_key === "etsy" &&
              storefront.external_account_id ? (
                <p className="text-xs text-muted-foreground">
                  Etsy shop {storefront.external_account_id}
                </p>
              ) : null}
              {storefront.connector_key === "etsy" ? (
                <a
                  href={`/api/etsy/start?connectionId=${storefront.id}`}
                  className={cn(buttonVariants({ size: "sm" }), "w-fit")}
                >
                  Connect Etsy
                </a>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void removeStorefront(storefront.id, storefront.display_name);
                }}
              >
                Remove
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
