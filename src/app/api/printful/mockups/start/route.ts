import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getFulfillmentConnector } from "@/lib/connectors/fulfillment/registry";
import type { DesignPlacement } from "@/lib/types/database";

export const maxDuration = 60;

type StartMockupBody = {
  providerKey: string;
  productId: string;
  color: string;
  size: string;
  areaId: string;
  artworkUrl: string;
  areaWidthPx: number;
  areaHeightPx: number;
  placement: DesignPlacement;
  artworkWidthPx: number;
  artworkHeightPx: number;
};

export async function POST(request: Request) {
  const { error: authError } = await requireApiUser();
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  let body: StartMockupBody;
  try {
    body = (await request.json()) as StartMockupBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const connector = getFulfillmentConnector(body.providerKey);
  if (!connector?.startMockupGeneration) {
    return NextResponse.json(
      { error: "This fulfillment provider does not support mockup generation yet." },
      { status: 400 }
    );
  }

  try {
    const { taskKey } = await connector.startMockupGeneration({
      productId: body.productId,
      color: body.color,
      size: body.size,
      areaId: body.areaId,
      artworkUrl: body.artworkUrl,
      areaWidthPx: body.areaWidthPx,
      areaHeightPx: body.areaHeightPx,
      placement: body.placement,
      artworkWidthPx: body.artworkWidthPx,
      artworkHeightPx: body.artworkHeightPx,
    });
    return NextResponse.json({ taskKey });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start mockup generation.",
      },
      { status: 500 }
    );
  }
}
