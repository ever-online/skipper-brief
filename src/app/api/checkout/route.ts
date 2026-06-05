import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { EurdClient, EurdApiError } from "@/lib/eurd";
import { store } from "@/lib/store";
import type { OrderRecord, ForecastRequest } from "@/types";

const ACCOUNT_CODE = process.env.EURD_ACCOUNT_CODE ?? "";
const EXPIRY_MINUTES = Number(process.env.EURD_PAYMENT_EXPIRY_MINUTES ?? 30);
const PUBLIC_URL = process.env.PUBLIC_URL ?? "http://localhost:3003";
const REPORT_PRICE = 0.50;

export async function POST(req: NextRequest) {
  const body = await req.json() as ForecastRequest;

  if (!body.boatType || !body.boatSize || (!body.regionId && !body.startLocation)) {
    return NextResponse.json({ error: "Missing required forecast parameters" }, { status: 400 });
  }

  if (!ACCOUNT_CODE) {
    return NextResponse.json({ error: "Payment not configured (missing EURD_ACCOUNT_CODE)" }, { status: 503 });
  }

  const locationLabel = body.regionId
    ? body.regionId.replace(/-/g, " ")
    : `${body.startLocation ?? "?"} → ${body.endLocation ?? "?"}`;

  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000).toISOString();
  const callbackUrl = `${PUBLIC_URL}/api/webhook`;

  const client = new EurdClient();
  let pr: Awaited<ReturnType<EurdClient["createPaymentRequest"]>>;
  try {
    pr = await client.createPaymentRequest({
      accountCode: ACCOUNT_CODE,
      amount: REPORT_PRICE,
      options: {
        expiresOn: expiresAt.split(".")[0] + "Z",
        shareName: false,
        isOneOffPayment: true,
        payerCanChangeRequestedAmount: false,
        message: `SkipperBrief: ${locationLabel} — €${REPORT_PRICE.toFixed(2)}`,
        callbackUrl,
      },
    });
  } catch (err) {
    const msg = err instanceof EurdApiError ? err.message : String(err);
    return NextResponse.json({ error: `Payment request failed: ${msg}` }, { status: 502 });
  }

  const order: OrderRecord = {
    id: randomUUID(),
    forecastRequest: body,
    status: "pending",
    eurdPaymentRequestCode: pr.code,
    qrCodeString: pr.qrCodeString,
    shareableLink: pr.shareableLink,
    amount: REPORT_PRICE,
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  store.set(order);

  return NextResponse.json({ sessionId: order.id });
}
