import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardStats } from "@/lib/data/queries";
import { AlertCircle, Package, ShoppingBag, Store } from "lucide-react";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          What is happening with the business, and what needs your attention?
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{stats.totalItems}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Published Listings</CardTitle>
            <Store className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{stats.publishedItems}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Orders</CardTitle>
            <ShoppingBag className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{stats.totalOrders}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <AlertCircle className="size-5 text-muted-foreground" />
          <CardTitle>Needs Attention</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.ordersNeedingAttention > 0 ? (
            <p className="text-sm">
              <Link href="/orders" className="font-medium underline">
                {stats.ordersNeedingAttention} order
                {stats.ordersNeedingAttention === 1 ? "" : "s"}
              </Link>{" "}
              pending or in fulfillment need your attention.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing needs your attention right now. New orders and sync issues
              will appear here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
