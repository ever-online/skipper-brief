import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { EurdClient, EurdApiError } from "@/lib/eurd";
import { store } from "@/lib/store";
import type { OrderRecord, ForecastRequest } from "@/types";

const ACCOUNT_CODE = process.env.EURD_ACCOUNT_CODE ?? "";
const EXPIRY_MINUTES = Number(process.env.EURD_PAYMENT_EXPIRY_MINUTES ?? 30);
const PUBLIC_URL = process.env.PUBLIC_URL ?? "http://localhost:3003";
const ALGO_MERCHANT_ADDRESS = process.env.ALGORAND_MERCHANT_ADDRESS ?? "";
const EURD_ASA_ID = process.env.EURD_ASA_ID ?? "1221682136";
const REPORT_PRICE = 0.01;
// EURD has 2 decimal places
const ATOMIC_PRICE = Math.round(REPORT_PRICE * 100);

export async function POST(req: NextRequest) {
  const body = await req.json() as ForecastRequest;

  if (!body.boatType || !body.boatSize || (!body.regionId && !body.startLocation)) {
    return NextResponse.json({ error: "Missing required forecast parameters" }, { status: 400 });
  }

  if (!ACCOUNT_CODE && !ALGO_MERCHANT_ADDRESS) {
    return NextResponse.json({ error: "Payment not configured" }, { status: 503 });
  }

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000).toISOString();
  const locationLabel = body.regionId
    ? body.regionId.replace(/-/g, " ")
    : `${body.startLocation ?? "?"} → ${body.endLocation ?? "?"}`;

  // ── Path A: Quantoz managed-account EURD payment ─────────────────────────────
  if (ACCOUNT_CODE) {
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
      id: sessionId,
      forecastRequest: body,
      status: "pending",
      paymentMethod: "eurd",
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

  // ── Path B: Algorand on-chain EURD payment via QR ─────────────────────────────
  // ARC-26 URI: the session ID is used as the transaction note so we can
  // identify the specific payment when polling the Algorand indexer.
  const arc26Uri = `algorand://${ALGO_MERCHANT_ADDRESS}?amount=${ATOMIC_PRICE}&asset=${EURD_ASA_ID}&note=${encodeURIComponent(sessionId)}`;

  const order: OrderRecord = {
    id: sessionId,
    forecastRequest: body,
    status: "pending",
    paymentMethod: "algorand",
    algorandMerchantAddress: ALGO_MERCHANT_ADDRESS,
    qrCodeString: arc26Uri,
    shareableLink: arc26Uri,
    amount: REPORT_PRICE,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  store.set(order);
  return NextResponse.json({ sessionId: order.id });
}
