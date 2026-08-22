export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function parseDollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function formatPublishedTo(
  listings: Array<{ sync_status: string; connector_registry?: { display_name: string } | null }>
): string {
  const published = listings
    .filter((l) => l.sync_status === "published")
    .map((l) => l.connector_registry?.display_name ?? "Unknown");

  return published.length > 0 ? published.join(", ") : "—";
}
