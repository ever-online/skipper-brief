import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { store } from "@/lib/store";
import type { EurdWebhookPayload } from "@/types";

export async function POST(req: NextRequest) {
  let payload: EurdWebhookPayload;
  try {
    payload = await req.json() as EurdWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { paymentRequestCode, status } = payload;
  if (!paymentRequestCode) {
    return NextResponse.json({ error: "Missing paymentRequestCode" }, { status: 400 });
  }

  // Acknowledge immediately
  const order = store.getByEurdCode(paymentRequestCode);
  if (!order || order.status !== "pending") {
    return NextResponse.json({ received: true });
  }

  const isPaid = status?.toLowerCase() === "paid";
  const isFailed = status?.toLowerCase() === "cancelled" || status?.toLowerCase() === "expired";

  if (isPaid) {
    store.update(order.id, {
      status: "paid",
      paidAt: new Date().toISOString(),
      downloadToken: randomUUID(),
    });
  } else if (isFailed) {
    store.update(order.id, { status: "failed" });
  }

  return NextResponse.json({ received: true });
}
