import { StorefrontManager } from "@/components/admin/storefront-manager";
import { getStorefronts } from "@/lib/data/queries";

export default async function StorefrontsPage({
  searchParams,
}: {
  searchParams: Promise<{ etsy?: string }>;
}) {
  const storefronts = await getStorefronts();
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Storefronts</h1>
        <p className="mt-2 text-muted-foreground">
          Every shop that can sell a Market Hub item. Several Etsy accounts are
          separate storefronts.
        </p>
      </div>
      <StorefrontManager storefronts={storefronts} notice={params.etsy ?? null} />
    </div>
  );
}
