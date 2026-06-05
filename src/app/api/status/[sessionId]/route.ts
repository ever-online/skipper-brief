import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { store } from "@/lib/store";
import { EurdClient } from "@/lib/eurd";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const order = store.get(sessionId);

  if (!order) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // If still pending, check Quantoz API at most every 5 seconds
  const staleSince = order.lastCheckedAt
    ? Date.now() - new Date(order.lastCheckedAt).getTime()
    : Infinity;

  if (order.status === "pending" && staleSince > 5000) {
    store.update(order.id, { lastCheckedAt: new Date().toISOString() });
    try {
      const client = new EurdClient();
      const result = await client.listPaymentRequests({
        paymentRequestCode: order.eurdPaymentRequestCode,
        pageSize: 1,
      });
      const pr = result?.items?.find((r) => r.code === order.eurdPaymentRequestCode);
      if (pr?.status === "Paid") {
        store.update(order.id, {
          status: "paid",
          paidAt: new Date().toISOString(),
          downloadToken: randomUUID(),
        });
      } else if (pr?.status === "Expired" || pr?.status === "Cancelled") {
        store.update(order.id, { status: "failed" });
      }
    } catch {
      // Ignore API errors — return current cached status
    }
  }

  const current = store.get(sessionId)!;
  return NextResponse.json({
    status: current.status,
    forecastRequest: current.forecastRequest,
    amount: current.amount,
    paidAt: current.paidAt,
    downloadToken: current.status === "paid" ? current.downloadToken : undefined,
  });
}
