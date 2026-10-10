import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { sortApparelSizes } from "@/lib/variants/combinations";

type SaveMockupBody = {
  imageUrl: string;
  label?: string;
  color?: string;
  sizes?: string[];
};

type MockupRow = {
  id: string;
  item_id: string;
  storage_path: string;
  source_url: string | null;
  label: string | null;
  color_name: string | null;
  fulfillment_provider_key: string | null;
  variant_id: string | null;
  created_at: string;
};

async function providerNames(
  supabase: NonNullable<Awaited<ReturnType<typeof requireApiUser>>["supabase"]>,
  keys: string[]
) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();

  const { data } = await supabase
    .from("connector_registry")
    .select("key, display_name")
    .in("key", unique);

  return new Map(
    (data ?? []).map((row) => [row.key as string, row.display_name as string])
  );
}

function toSavedMockup(
  row: MockupRow,
  url: string | null,
  names: Map<string, string>,
  sizes: string[]
) {
  const providerKey = row.fulfillment_provider_key;
  return {
    id: row.id,
    item_id: row.item_id,
    storage_path: row.storage_path,
    source_url: row.source_url,
    label: row.label,
    color_name: row.color_name,
    fulfillment_provider_key: providerKey,
    fulfillment_provider_name: providerKey
      ? (names.get(providerKey) ?? providerKey)
      : null,
    variant_id: row.variant_id,
    sizes,
    created_at: row.created_at,
    url,
  };
}

async function sizesByColor(
  supabase: NonNullable<Awaited<ReturnType<typeof requireApiUser>>["supabase"]>,
  itemId: string
) {
  const { data } = await supabase
    .from("item_variants")
    .select("sku, attributes")
    .eq("item_id", itemId);

  const grouped = new Map<string, string[]>();
  for (const row of data ?? []) {
    if (!row.sku) continue;
    const attributes = row.attributes as { color?: string; size?: string } | null;
    const color = attributes?.color?.trim();
    const size = attributes?.size?.trim();
    if (!color || !size) continue;
    const key = color.toLowerCase();
    const sizes = grouped.get(key) ?? [];
    if (!sizes.includes(size)) sizes.push(size);
    grouped.set(key, sizes);
  }
  for (const [key, sizes] of grouped) {
    grouped.set(key, sortApparelSizes(sizes));
  }
  return grouped;
}

function extensionFromContentType(contentType: string | null): string {
  if (!contentType) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "jpg";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: itemId } = await params;

  const { data: item } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("item_mockups")
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const typedRows = (rows ?? []) as MockupRow[];
  const names = await providerNames(
    supabase,
    typedRows.map((row) => row.fulfillment_provider_key ?? "")
  );
  const sizes = await sizesByColor(supabase, itemId);
  const mockups = await Promise.all(
    typedRows.map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("mockups")
        .createSignedUrl(row.storage_path, 60 * 60 * 24);
      const color = row.color_name?.trim().toLowerCase() ?? "";
      return toSavedMockup(row, signed?.signedUrl ?? null, names, sizes.get(color) ?? []);
    })
  );

  return NextResponse.json({ mockups });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: itemId } = await params;

  let body: SaveMockupBody;
  try {
    body = (await request.json()) as SaveMockupBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.imageUrl?.trim()) {
    return NextResponse.json({ error: "imageUrl is required." }, { status: 400 });
  }

  const color = body.color?.trim() ?? "";
  if (!color) {
    return NextResponse.json(
      { error: "Choose a color before saving this mockup." },
      { status: 400 }
    );
  }

  const sizes = (body.sizes ?? []).map((size) => size.trim()).filter(Boolean);

  const { data: item } = await supabase
    .from("items")
    .select("id, fulfillment_provider_key")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const providerKey = (item.fulfillment_provider_key as string | null) ?? null;

  let catalogProductId = "";
  let designId: string | null = null;
  if (providerKey === "printful") {
    const { data: design } = await supabase
      .from("item_designs")
      .select("id, provider_product_ref")
      .eq("item_id", itemId)
      .maybeSingle();
    const productRef = design?.provider_product_ref as { id?: string } | null;
    catalogProductId = productRef?.id ? String(productRef.id) : "";
    designId = (design?.id as string | undefined) ?? null;
    if (!catalogProductId) {
      return NextResponse.json(
        { error: "Save the design first so Market Hub knows which Printful product to use." },
        { status: 400 }
      );
    }
  }

  let imageResponse: Response;
  try {
    imageResponse = await fetch(body.imageUrl, { cache: "no-store" });
  } catch {
    return NextResponse.json(
      { error: "Could not download mockup image from Printful." },
      { status: 502 }
    );
  }

  if (!imageResponse.ok) {
    return NextResponse.json(
      { error: `Mockup download failed (${imageResponse.status}).` },
      { status: 502 }
    );
  }

  const contentType =
    imageResponse.headers.get("content-type") ?? "image/jpeg";
  const extension = extensionFromContentType(contentType);
  const bytes = Buffer.from(await imageResponse.arrayBuffer());

  if (bytes.byteLength === 0) {
    return NextResponse.json(
      { error: "Downloaded mockup image was empty." },
      { status: 502 }
    );
  }

  const storagePath = `${user.id}/${itemId}/${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("mockups")
    .upload(storagePath, bytes, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    const message = uploadError.message.toLowerCase().includes("bucket")
      ? 'Storage bucket "mockups" not found. In Supabase SQL Editor, run supabase/migrations/20261006100000_item_mockups.sql'
      : uploadError.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: existingVariants, error: variantsError } = await supabase
    .from("item_variants")
    .select("id, attributes")
    .eq("item_id", itemId);

  if (variantsError) {
    await supabase.storage.from("mockups").remove([storagePath]);
    return NextResponse.json({ error: variantsError.message }, { status: 500 });
  }

  const match = (existingVariants ?? []).find((variant) => {
    const attributes = variant.attributes as { color?: string } | null;
    return attributes?.color?.trim().toLowerCase() === color.toLowerCase();
  });

  let variantId = match?.id as string | undefined;
  let createdVariant = false;
  const attributes = {
    color,
    ...(sizes[0] ? { size: sizes[0] } : {}),
    ...(sizes.length > 0 ? { sizes } : {}),
    ...(providerKey ? { fulfillment_provider_key: providerKey } : {}),
  };

  if (variantId && sizes.length > 0) {
    await supabase
      .from("item_variants")
      .update({ label: color, attributes })
      .eq("id", variantId);
  }

  if (!variantId) {
    const { data: created, error: variantError } = await supabase
      .from("item_variants")
      .insert({
        item_id: itemId,
        label: color,
        attributes,
      })
      .select("id")
      .single();

    if (variantError || !created) {
      await supabase.storage.from("mockups").remove([storagePath]);
      return NextResponse.json(
        { error: variantError?.message ?? "Could not create the color variant." },
        { status: 500 }
      );
    }
    variantId = created.id;
    createdVariant = true;
  }

  const { data: row, error: insertError } = await supabase
    .from("item_mockups")
    .insert({
      item_id: itemId,
      storage_path: storagePath,
      source_url: body.imageUrl,
      label: color,
      color_name: color,
      fulfillment_provider_key: providerKey,
      variant_id: variantId,
    })
    .select("*")
    .single();

  if (insertError || !row) {
    await supabase.storage.from("mockups").remove([storagePath]);
    if (createdVariant && variantId) {
      await supabase.from("item_variants").delete().eq("id", variantId);
    }
    const missingColumn = insertError?.message.toLowerCase().includes("column");
    return NextResponse.json(
      {
        error: missingColumn
          ? "Run supabase/migrations/20261008150000_mockup_color_variants.sql in the Supabase SQL Editor, then save again."
          : (insertError?.message ?? "Could not save mockup record."),
      },
      { status: 500 }
    );
  }

  const names = await providerNames(supabase, providerKey ? [providerKey] : []);
  const { data: signed } = await supabase.storage
    .from("mockups")
    .createSignedUrl(storagePath, 60 * 60 * 24);

  if (providerKey === "printful") {
    const { syncPrintfulColorVariants } = await import(
      "@/lib/variants/sync-printful"
    );
    const variantSync = await syncPrintfulColorVariants(supabase, {
      itemId,
      mockupId: (row as MockupRow).id,
      colorName: color,
      catalogProductId,
      designId,
    });
    if (variantSync.error || variantSync.mapped === 0) {
      await supabase.from("item_mockups").delete().eq("id", (row as MockupRow).id);
      await supabase.storage.from("mockups").remove([storagePath]);
      if (createdVariant && variantId) {
        await supabase.from("item_variants").delete().eq("id", variantId);
      }
      return NextResponse.json(
        {
          error:
            variantSync.error ??
            `Printful has no in-stock sizes for ${color}.`,
        },
        { status: 502 }
      );
    }
  }

  const sizeNames = await sizesByColor(supabase, itemId);
  return NextResponse.json({
    mockup: toSavedMockup(
      row as MockupRow,
      signed?.signedUrl ?? null,
      names,
      sizeNames.get(color.toLowerCase()) ?? []
    ),
  });
}
