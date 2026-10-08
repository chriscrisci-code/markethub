import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";

type SaveMockupBody = {
  imageUrl: string;
  label?: string;
};

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

  const mockups = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("mockups")
        .createSignedUrl(row.storage_path, 60 * 60 * 24);
      return {
        id: row.id as string,
        item_id: row.item_id as string,
        storage_path: row.storage_path as string,
        source_url: (row.source_url as string | null) ?? null,
        label: (row.label as string | null) ?? null,
        created_at: row.created_at as string,
        url: signed?.signedUrl ?? null,
      };
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

  const { data: item } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
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

  const { data: row, error: insertError } = await supabase
    .from("item_mockups")
    .insert({
      item_id: itemId,
      storage_path: storagePath,
      source_url: body.imageUrl,
      label: body.label?.trim() || null,
    })
    .select("*")
    .single();

  if (insertError || !row) {
    await supabase.storage.from("mockups").remove([storagePath]);
    return NextResponse.json(
      { error: insertError?.message ?? "Could not save mockup record." },
      { status: 500 }
    );
  }

  const { data: signed } = await supabase.storage
    .from("mockups")
    .createSignedUrl(storagePath, 60 * 60 * 24);

  return NextResponse.json({
    mockup: {
      id: row.id,
      item_id: row.item_id,
      storage_path: row.storage_path,
      source_url: row.source_url,
      label: row.label,
      created_at: row.created_at,
      url: signed?.signedUrl ?? null,
    },
  });
}
