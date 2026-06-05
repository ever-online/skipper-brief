import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { store } from "@/lib/store";
import { EurdClient } from "@/lib/eurd";

const ALGONODE_INDEXER = "https://mainnet-idx.algonode.cloud";
const EURD_ASA_ID = process.env.EURD_ASA_ID ?? "1221682136";
// EURD has 2 decimal places
const ATOMIC_PRICE = Math.round(0.01 * 100);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const order = store.get(sessionId);

  if (!order) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Throttle checks to at most every 5 seconds
  const staleSince = order.lastCheckedAt
    ? Date.now() - new Date(order.lastCheckedAt).getTime()
    : Infinity;

  if (order.status === "pending" && staleSince > 5000) {
    store.update(order.id, { lastCheckedAt: new Date().toISOString() });

    if (order.paymentMethod === "eurd" && order.eurdPaymentRequestCode) {
      // ── Quantoz managed-account check ────────────────────────────────────────
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
    } else if (order.paymentMethod === "algorand" && order.algorandMerchantAddress) {
      // ── Algorand on-chain check ───────────────────────────────────────────────
      // The session ID was used as the transaction note (ARC-26 URI).
      // When Pera Wallet or Quantoz app sends the tx, the note is stored as
      // base64-encoded bytes. We search by note-prefix = base64(sessionId).
      try {
        const noteBase64 = Buffer.from(sessionId).toString("base64");
        const url = `${ALGONODE_INDEXER}/v2/transactions?asset-id=${EURD_ASA_ID}&address=${order.algorandMerchantAddress}&address-role=receiver&note-prefix=${encodeURIComponent(noteBase64)}&limit=5`;

        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (res.ok) {
          const data = await res.json() as {
            transactions?: Array<{
              id: string;
              "asset-transfer-transaction"?: { amount: number; receiver: string };
            }>;
          };

          const match = data.transactions?.find((tx) => {
            const axfer = tx["asset-transfer-transaction"];
            return axfer && axfer.amount >= ATOMIC_PRICE;
          });

          if (match) {
            store.update(order.id, {
              status: "paid",
              paidAt: new Date().toISOString(),
              downloadToken: randomUUID(),
              algorandTxId: match.id,
            });
          }
        }
      } catch {
        // Ignore indexer errors — return current cached status
      }
    }
  }

  const current = store.get(sessionId)!;
  return NextResponse.json({
    status: current.status,
    forecastRequest: current.forecastRequest,
    amount: current.amount,
    paidAt: current.paidAt,
    downloadToken: current.status === "paid" ? current.downloadToken : undefined,
    algorandTxId: current.algorandTxId,
  });
}
