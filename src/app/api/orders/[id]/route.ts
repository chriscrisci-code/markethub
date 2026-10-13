import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";

const ARCHIVE_SQL_ERROR =
  "Archive is not ready yet. Run the orders archive SQL in the Supabase SQL Editor, then try again.";

type OrderActionBody = {
  action?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, error: authError } = await requireApiUser();
  if (authError || !supabase || !user) {
    return NextResponse.json(
      { error: "You must be signed in to update an order." },
      { status: 401 }
    );
  }

  const { id: orderId } = await params;

  let body: OrderActionBody;
  try {
    body = (await request.json()) as OrderActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = body.action;
  if (action !== "fulfill" && action !== "archive" && action !== "unarchive") {
    return NextResponse.json({ error: "Unknown order action." }, { status: 400 });
  }

  const update =
    action === "fulfill"
      ? { status: "fulfilled" }
      : action === "archive"
        ? { archived_at: new Date().toISOString() }
        : { archived_at: null };

  const { data, error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", orderId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.message.toLowerCase().includes("archived_at")) {
      return NextResponse.json({ error: ARCHIVE_SQL_ERROR }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
