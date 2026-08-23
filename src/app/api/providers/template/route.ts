import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getFulfillmentConnector } from "@/lib/connectors/fulfillment/registry";

export async function GET(request: Request) {
  const { error: authError } = await requireApiUser();
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerKey = searchParams.get("providerKey");
  const productId = searchParams.get("productId");
  const areaId = searchParams.get("areaId");
  const color = searchParams.get("color") ?? undefined;

  if (!providerKey || !productId || !areaId) {
    return NextResponse.json(
      { error: "providerKey, productId, and areaId are required." },
      { status: 400 }
    );
  }

  const connector = getFulfillmentConnector(providerKey);
  if (!connector?.getProductTemplate) {
    return NextResponse.json({ template: null });
  }

  try {
    const template = await connector.getProductTemplate(
      { id: productId },
      { areaId, color }
    );
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      {
        template: null,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load product template.",
      },
      { status: 500 }
    );
  }
}
