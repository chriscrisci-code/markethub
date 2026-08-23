import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getFulfillmentConnector } from "@/lib/connectors/fulfillment/registry";

export const maxDuration = 60;

export async function GET(request: Request) {
  const { error: authError } = await requireApiUser();
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerKey = searchParams.get("providerKey");
  const taskKey = searchParams.get("taskKey");

  if (!providerKey || !taskKey) {
    return NextResponse.json(
      { error: "providerKey and taskKey are required." },
      { status: 400 }
    );
  }

  const connector = getFulfillmentConnector(providerKey);
  if (!connector?.getMockupTask) {
    return NextResponse.json(
      { error: "This fulfillment provider does not support mockup generation yet." },
      { status: 400 }
    );
  }

  try {
    const result = await connector.getMockupTask(taskKey);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to poll mockup task.",
      },
      { status: 500 }
    );
  }
}
