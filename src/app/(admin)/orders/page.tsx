import Link from "next/link";
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
import { simulateMarketplaceOrder } from "@/lib/actions/orders";
import { getOrders } from "@/lib/data/queries";
import { formatCents } from "@/lib/domain/format";
import { calculateOrderProfit } from "@/lib/domain/profit";

export default async function OrdersPage() {
  const orders = await getOrders();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-2 text-muted-foreground">
            Normalized orders from every sales channel.
          </p>
        </div>
        <form action={simulateMarketplaceOrder}>
          <Button type="submit">
            <Plus className="size-4" />
            Simulate Order
          </Button>
        </form>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No orders yet. Publish an item, then simulate a marketplace order to
            prove the fulfillment loop.
          </p>
          <form action={simulateMarketplaceOrder} className="mt-4">
            <Button type="submit">
              <Plus className="size-4" />
              Simulate Order
            </Button>
          </form>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead>Est. Profit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const profit = calculateOrderProfit(
                  order.order_costs,
                  order.sale_amount_cents
                );
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-medium hover:underline"
                      >
                        #{order.market_hub_order_number}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {order.external_order_id}
                      </p>
                    </TableCell>
                    <TableCell>
                      {order.source_connector?.display_name ?? "—"}
                    </TableCell>
                    <TableCell>{order.customer?.name ?? "—"}</TableCell>
                    <TableCell>{formatCents(order.sale_amount_cents)}</TableCell>
                    <TableCell>
                      {formatCents(profit.estimatedProfitCents)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.status === "fulfilled"
                            ? "default"
                            : order.status === "pending"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
