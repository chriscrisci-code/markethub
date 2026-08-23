"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFulfillmentConnector } from "@/lib/connectors/fulfillment/registry";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

/**
 * Simulates a marketplace order for a published item (or any item if none published).
 * Creates order + line item + expected marketplace fee + expected fulfillment cost.
 */
export async function simulateMarketplaceOrder() {
  const { supabase, user } = await requireUser();

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select(
      `
      *,
      item_designs (*),
      channel_listings (*)
    `
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const published =
    items?.find((item) =>
      (item.channel_listings as Array<{ sync_status: string }> | null)?.some(
        (l) => l.sync_status === "published"
      )
    ) ?? items?.[0];

  if (!published) {
    throw new Error("Create an item first, then simulate an order.");
  }

  const saleAmount = published.base_price_cents || 2800;
  const marketplaceFee = Math.round(saleAmount * 0.129);
  const design = Array.isArray(published.item_designs)
    ? published.item_designs[0]
    : published.item_designs;
  const productRef = design?.provider_product_ref as
    | { baseCostCents?: number }
    | null
    | undefined;
  const fulfillmentExpected = productRef?.baseCostCents ?? 1240;

  const sourceConnector =
    (published.channel_listings as Array<{
      connector_key: string;
      sync_status: string;
    }> | null)?.find((l) => l.sync_status === "published")?.connector_key ??
    "mock-marketplace";

  const externalOrderId = `MOCK-ORD-${Date.now().toString(36).toUpperCase()}`;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      source_connector_key: sourceConnector,
      external_order_id: externalOrderId,
      customer: {
        name: "Alex Customer",
        email: "alex.customer@example.com",
      },
      shipping: {
        line1: "123 Main St",
        city: "Austin",
        state: "TX",
        postal_code: "78701",
        country: "US",
      },
      status: "pending",
      sale_amount_cents: saleAmount,
    })
    .select("*")
    .single();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? "Failed to create order.");
  }

  await supabase.from("order_line_items").insert({
    order_id: order.id,
    item_id: published.id,
    label: published.name,
    quantity: 1,
    unit_price_cents: saleAmount,
  });

  await supabase.from("order_costs").insert([
    {
      order_id: order.id,
      cost_type: "marketplace_fee",
      label: "Marketplace fee (estimated)",
      amount_cents: marketplaceFee,
      is_confirmed: false,
    },
    {
      order_id: order.id,
      cost_type: "fulfillment_expected",
      label: "Fulfillment cost (expected)",
      amount_cents: fulfillmentExpected,
      is_confirmed: false,
    },
  ]);

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  redirect(`/orders/${order.id}`);
}

export async function sendOrderToFulfillment(orderId: string) {
  const { supabase, user } = await requireUser();

  const { data: order, error } = await supabase
    .from("orders")
    .select("*, order_line_items (*), fulfillment_jobs (*)")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !order) {
    return { error: error?.message ?? "Order not found." };
  }

  if (order.status === "cancelled" || order.status === "refunded") {
    return { error: "Cannot fulfill a cancelled or refunded order." };
  }

  const existingJob = Array.isArray(order.fulfillment_jobs)
    ? order.fulfillment_jobs[0]
    : null;

  if (existingJob?.external_job_id) {
    return { error: "Fulfillment already submitted for this order." };
  }

  // Resolve fulfillment provider from the first line item's item
  const lineItems = order.order_line_items as Array<{
    item_id: string | null;
    label: string;
    quantity: number;
    unit_price_cents: number;
  }>;
  const firstItemId = lineItems[0]?.item_id;
  let providerKey = "mock-fulfillment";

  if (firstItemId) {
    const { data: item } = await supabase
      .from("items")
      .select("fulfillment_provider_key")
      .eq("id", firstItemId)
      .maybeSingle();
    if (item?.fulfillment_provider_key) {
      providerKey = item.fulfillment_provider_key;
    }
  }

  const connector = getFulfillmentConnector(providerKey);
  if (!connector) {
    return { error: "Fulfillment connector not found." };
  }

  const shipping = (order.shipping ?? {}) as Record<string, string>;
  const customer = (order.customer ?? {}) as Record<string, string>;

  let fulfillmentItems:
    | Array<{
        variantId: number;
        quantity: number;
        name: string;
        files: Array<{ type: string; url: string }>;
      }>
    | undefined;

  if (providerKey === "printful" && firstItemId) {
    const { data: itemRow } = await supabase
      .from("items")
      .select(
        `
        name,
        item_designs (*),
        item_artwork (*),
        item_variants (*)
      `
      )
      .eq("id", firstItemId)
      .maybeSingle();

    const design = Array.isArray(itemRow?.item_designs)
      ? itemRow?.item_designs[0]
      : itemRow?.item_designs;
    const artworkRows = Array.isArray(itemRow?.item_artwork)
      ? itemRow.item_artwork
      : itemRow?.item_artwork
        ? [itemRow.item_artwork]
        : [];
    const variants = Array.isArray(itemRow?.item_variants)
      ? itemRow.item_variants
      : [];

    const productRef = design?.provider_product_ref as
      | { id?: string; areaId?: string }
      | null
      | undefined;

    const { artworkBySide, normalizePrintableAreas } = await import(
      "@/lib/domain/artwork-sides"
    );
    const bySide = artworkBySide(
      artworkRows as import("@/lib/types/database").ItemArtwork[]
    );
    const areas = normalizePrintableAreas(
      (design as { printable_areas?: unknown; printable_area?: unknown } | null)
        ?.printable_areas ??
        (design as { printable_area?: unknown } | null)?.printable_area
    );

    if (!productRef?.id || (!bySide.front && !bySide.back)) {
      return {
        error:
          "Printful fulfillment needs a saved Printful product design and uploaded artwork on the item.",
      };
    }

    const files: Array<{ type: string; url: string }> = [];
    for (const side of ["front", "back"] as const) {
      const art = bySide[side];
      if (!art?.storage_path) continue;
      const { data: signed } = await supabase.storage
        .from("artwork")
        .createSignedUrl(art.storage_path, 60 * 60 * 24);
      if (!signed?.signedUrl) {
        return { error: `Could not create a signed URL for ${side} artwork.` };
      }
      files.push({
        type: areas[side]?.areaId || side,
        url: signed.signedUrl,
      });
    }

    if (files.length === 0) {
      return { error: "Could not create signed URLs for artwork." };
    }

    const { resolvePrintfulVariantId } = await import(
      "@/lib/connectors/fulfillment/printful"
    );

    const primaryVariant = variants[0] as
      | { attributes?: { color?: string; size?: string }; label?: string }
      | undefined;
    const color = primaryVariant?.attributes?.color;
    const size = primaryVariant?.attributes?.size;

    if (!color || !size) {
      return {
        error:
          "Select at least one color and size on the item before fulfilling with Printful.",
      };
    }

    const variantId = await resolvePrintfulVariantId(
      productRef.id,
      color,
      size
    );

    if (!variantId) {
      return {
        error: `No Printful variant found for ${color} / ${size}.`,
      };
    }

    fulfillmentItems = [
      {
        variantId,
        quantity: lineItems[0]?.quantity ?? 1,
        name: itemRow?.name ?? lineItems[0]?.label ?? "Item",
        files,
      },
    ];
  }

  try {
    const result = await connector.submitFulfillment({
      externalOrderId: order.external_order_id ?? order.id,
      saleAmountCents: order.sale_amount_cents,
      lineItems: lineItems.map((li) => ({
        label: li.label,
        quantity: li.quantity,
        unitPriceCents: li.unit_price_cents,
      })),
      recipient: {
        name: customer.name,
        email: customer.email,
        address1: shipping.line1,
        city: shipping.city,
        stateCode: shipping.state,
        postalCode: shipping.postal_code,
        countryCode: shipping.country || "US",
      },
      fulfillmentItems,
    });

    const { error: jobError } = await supabase.from("fulfillment_jobs").insert({
      order_id: orderId,
      provider_key: providerKey,
      external_job_id: result.externalJobId,
      status: result.status,
      tracking: {},
    });

    if (jobError) {
      return { error: jobError.message };
    }

    await supabase
      .from("orders")
      .update({ status: "processing" })
      .eq("id", orderId);

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Fulfillment submit failed.",
    };
  }
}

export async function refreshFulfillmentStatus(orderId: string) {
  const { supabase, user } = await requireUser();

  const { data: order } = await supabase
    .from("orders")
    .select("*, fulfillment_jobs (*), order_costs (*)")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!order) {
    return { error: "Order not found." };
  }

  const job = Array.isArray(order.fulfillment_jobs)
    ? order.fulfillment_jobs[0]
    : null;

  if (!job?.external_job_id || !job.provider_key) {
    return { error: "No fulfillment job to refresh." };
  }

  const connector = getFulfillmentConnector(job.provider_key);
  if (!connector) {
    return { error: "Fulfillment connector not found." };
  }

  const status = await connector.getFulfillmentStatus(job.external_job_id);

  await supabase
    .from("fulfillment_jobs")
    .update({
      status: status.status,
      tracking: {
        carrier: status.carrier,
        trackingNumber: status.trackingNumber,
      },
    })
    .eq("id", job.id);

  if (status.status === "shipped" || status.status === "delivered") {
    await supabase.from("orders").update({ status: "fulfilled" }).eq("id", orderId);
  }

  // Optional confirmed billing when connector supports it
  if (connector.getBilling) {
    const billing = await connector.getBilling(job.external_job_id);
    if (billing?.confirmed) {
      const existingConfirmed = (
        order.order_costs as Array<{ cost_type: string }>
      ).some((c) => c.cost_type === "fulfillment_confirmed");

      if (!existingConfirmed) {
        await supabase.from("order_costs").insert({
          order_id: orderId,
          cost_type: "fulfillment_confirmed",
          label: "Fulfillment cost (confirmed)",
          amount_cents: billing.amountCents,
          is_confirmed: true,
        });
      }
    }
  }

  // Mock: notify marketplace of tracking when shipped
  if (status.trackingNumber && order.source_connector_key) {
    // Marketplace update is best-effort; mock connectors may no-op
    const { getMarketplaceConnector } = await import(
      "@/lib/connectors/marketplace/registry"
    );
    const marketplace = getMarketplaceConnector(order.source_connector_key);
    if (marketplace?.updateOrderTracking) {
      await marketplace.updateOrderTracking(order.external_order_id, {
        carrier: status.carrier ?? "USPS",
        trackingNumber: status.trackingNumber,
      });
    }
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return { success: true, status: status.status };
}
