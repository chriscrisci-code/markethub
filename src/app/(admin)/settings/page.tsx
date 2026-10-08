import { SiteAccessForm } from "@/components/admin/site-access-form";
import { readSiteAccess } from "@/lib/auth/site-access";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const access = await readSiteAccess();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          This is the username and password for Market Hub. Buyer payment still
          happens on each storefront.
        </p>
      </div>
      <SiteAccessForm initialUsername={access.username} />
    </div>
  );
}
