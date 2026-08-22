import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrderActions } from "@/components/admin/order-actions";
import { getOrder } from "@/lib/data/queries";
import { formatCents } from "@/lib/domain/format";
import { calculateOrderProfit } from "@/lib/domain/profit";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) {
    notFound();
  }

  const profit = calculateOrderProfit(order.order_costs, order.sale_amount_cents);
  const job = order.fulfillment_jobs[0] ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/orders" className="hover:underline">
              Orders
            </Link>
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Order #{order.market_hub_order_number}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge>{order.status}</Badge>
            <span className="text-sm text-muted-foreground">
              {order.source_connector?.display_name ?? "Channel"} ·{" "}
              {order.external_order_id}
            </span>
          </div>
        </div>
        <OrderActions
          orderId={order.id}
          status={order.status}
          hasFulfillmentJob={Boolean(job)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer & Shipping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Name: </span>
              {order.customer?.name ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Email: </span>
              {order.customer?.email ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Ship to: </span>
              {[
                order.shipping?.line1,
                order.shipping?.city,
                order.shipping?.state,
                order.shipping?.postal_code,
              ]
                .filter(Boolean)
                .join(", ") || "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estimated Profit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Sale" value={formatCents(profit.revenueCents)} />
            <Row
              label="Marketplace fees"
              value={`−${formatCents(profit.marketplaceFeesCents)}`}
            />
            <Row
              label={
                profit.usingConfirmedFulfillment
                  ? "Fulfillment (confirmed)"
                  : "Fulfillment (expected)"
              }
              value={`−${formatCents(
                profit.usingConfirmedFulfillment
                  ? profit.fulfillmentConfirmedCents
                  : profit.fulfillmentExpectedCents
              )}`}
            />
            {profit.otherCostsCents > 0 ? (
              <Row
                label="Other costs"
                value={`−${formatCents(profit.otherCostsCents)}`}
              />
            ) : null}
            <div className="border-t pt-2 font-semibold">
              <Row
                label="Estimated profit"
                value={formatCents(profit.estimatedProfitCents)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Estimates only — not tax advice. Confirmed fulfillment cost appears
              after the provider reports billing.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {order.order_line_items.map((line) => (
              <li
                key={line.id}
                className="flex items-center justify-between border-b py-2 last:border-0"
              >
                <span>
                  {line.label} × {line.quantity}
                </span>
                <span>{formatCents(line.unit_price_cents * line.quantity)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fulfillment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {job ? (
            <>
              <p>
                <span className="text-muted-foreground">Provider: </span>
                {job.provider_key}
              </p>
              <p>
                <span className="text-muted-foreground">Job: </span>
                {job.external_job_id}
              </p>
              <p>
                <span className="text-muted-foreground">Status: </span>
                {job.status}
              </p>
              {job.tracking?.trackingNumber ? (
                <p>
                  <span className="text-muted-foreground">Tracking: </span>
                  {job.tracking.carrier} {job.tracking.trackingNumber}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  No tracking yet — refresh status after production.
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              Not sent to fulfillment yet. Click Send to Fulfillment to start.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
