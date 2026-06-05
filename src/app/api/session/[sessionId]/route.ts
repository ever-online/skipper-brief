import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const order = store.get(sessionId);

  if (!order) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    forecastRequest: order.forecastRequest,
    amount: order.amount,
    status: order.status,
    qrCodeString: order.qrCodeString,
    shareableLink: order.shareableLink,
    expiresAt: order.expiresAt,
  });
}
