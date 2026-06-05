import { EurdClient, EurdApiError, type TransactionListItem } from "./eurd";

const ACCOUNT_CODE = process.env.EURD_ACCOUNT_CODE ?? "";
const EXPIRY_MINUTES = Number(process.env.X402_EXPIRY_MINUTES ?? 5);

// Algorand EURD on-chain config (optional — if not set, only the managed-account option is offered)
const ALGO_MERCHANT_ADDRESS = process.env.ALGORAND_MERCHANT_ADDRESS ?? "";
const ALGO_FACILITATOR_URL =
  process.env.ALGORAND_FACILITATOR_URL ?? "https://x402algo.ai.quantozpay.com";
const EURD_ASA_ID = process.env.EURD_ASA_ID ?? "1221682136";
// EURD has 2 decimal places — multiply EUR amount by 100 to get atomic units
const EURD_DECIMALS = 2;

// ─── Replay protection (for the managed-account "euro" scheme only) ───────────

const spentCodes = new Map<string, number>();

function pruneSpentCodes(): void {
  const now = Date.now();
  spentCodes.forEach((expiry, code) => {
    if (now > expiry) spentCodes.delete(code);
  });
}

function markSpent(code: string): void {
  pruneSpentCodes();
  spentCodes.set(code, Date.now() + 2 * 60 * 60_000);
}

function isSpent(code: string): boolean {
  pruneSpentCodes();
  return spentCodes.has(code);
}

// ─── 402 response body ────────────────────────────────────────────────────────

export async function build402Body(
  productId: string,
  amount: number,
  description: string
): Promise<object> {
  const accepts: object[] = [];

  // Option 1: Quantoz managed-account euro payment (instant, off-chain)
  if (ACCOUNT_CODE) {
    const client = new EurdClient();
    const expiresOn =
      new Date(Date.now() + EXPIRY_MINUTES * 60_000).toISOString().split(".")[0] + "Z";

    const pr = await client.createPaymentRequest({
      accountCode: ACCOUNT_CODE,
      amount,
      options: {
        expiresOn,
        isOneOffPayment: true,
        shareName: false,
        payerCanChangeRequestedAmount: false,
        message: `x402: ${description}`,
      },
    });

    accepts.push({
      scheme: "euro",
      network: "quantoz:mainnet",
      asset: "EURO",
      amount: String(amount),
      payTo: ACCOUNT_CODE,
      paymentRequestCode: pr.code,
      expiresAt: Math.floor((Date.now() + EXPIRY_MINUTES * 60_000) / 1000),
      facilitator: "https://api.quantozpay.com/x402",
      resource: productId,
    });
  }

  // Option 2: Algorand on-chain EURD (only included if merchant address is configured)
  if (ALGO_MERCHANT_ADDRESS) {
    const atomicAmount = Math.round(amount * Math.pow(10, EURD_DECIMALS));
    accepts.push({
      scheme: "exact",
      network: "algorand:mainnet",
      asset: EURD_ASA_ID,
      maxAmountRequired: String(atomicAmount),
      payTo: ALGO_MERCHANT_ADDRESS,
      maxTimeoutSeconds: 300,
      resource: productId,
      description: `x402: ${description}`,
      mimeType: "application/json",
      facilitator: ALGO_FACILITATOR_URL,
      extra: { name: "Algorand x402 EURD", version: "1.0.0" },
    });
  }

  return {
    x402Version: 2,
    error: "Payment required — include X-PAYMENT header",
    accepts,
  };
}

// ─── Verify proof ─────────────────────────────────────────────────────────────

interface PaymentProof {
  x402Version: number;
  scheme: string;
  network: string;
  payload: Record<string, unknown>;
}

export type VerifyResult =
  | { ok: true; receipt: string }
  | { ok: false; reason: string };

/**
 * Verify an X-PAYMENT header value.
 *
 * Handles two schemes:
 *  - "euro"  → Quantoz managed-account verification (payment request status)
 *  - "exact" → Algorand on-chain settlement via the x402 facilitator
 *
 * @param xPayment  Raw X-PAYMENT header value (base64url-encoded JSON)
 * @param context   Required for Algorand "exact" scheme: the expected amount (EUR)
 *                  and optional resource identifier
 */
export async function verifyProof(
  xPayment: string,
  context?: { amount: number; resource?: string }
): Promise<VerifyResult> {
  let proof: PaymentProof;
  try {
    const decoded = Buffer.from(xPayment, "base64url").toString("utf8");
    proof = JSON.parse(decoded) as PaymentProof;
  } catch {
    return { ok: false, reason: "Invalid X-PAYMENT encoding" };
  }

  // ── Route by scheme ──────────────────────────────────────────────────────────

  if (proof.scheme === "euro") {
    return verifyEuroProof(proof);
  }

  if (proof.scheme === "exact" && proof.network === "algorand:mainnet") {
    if (!context?.amount) {
      return { ok: false, reason: "Missing payment context for Algorand settlement" };
    }
    // Bridge proof: agent paid via Quantoz EURO→Algorand bridge (has transactionCode)
    // Direct proof: agent signed an on-chain tx directly (has transaction bytes)
    if (typeof proof.payload?.transactionCode === "string") {
      return verifyAlgorandBridgeProof(proof.payload as { transactionCode: string; payTo: string; asset: string }, context.amount);
    }
    return verifyAlgorandProof(xPayment, context.amount, context.resource);
  }

  return { ok: false, reason: `Unsupported scheme: ${proof.scheme}` };
}

// ─── Euro scheme (Quantoz managed accounts) ───────────────────────────────────

async function verifyEuroProof(proof: PaymentProof): Promise<VerifyResult> {
  const paymentRequestCode = proof.payload?.paymentRequestCode as string | undefined;
  if (!paymentRequestCode) {
    return { ok: false, reason: "Missing paymentRequestCode in proof" };
  }

  if (isSpent(paymentRequestCode)) {
    return { ok: false, reason: "Payment already used" };
  }

  const client = new EurdClient();
  let result: Awaited<ReturnType<EurdClient["listPaymentRequests"]>>;
  try {
    result = await client.listPaymentRequests({ paymentRequestCode, pageSize: 1 });
  } catch (err) {
    const msg = err instanceof EurdApiError ? err.message : String(err);
    return { ok: false, reason: `Verification failed: ${msg}` };
  }

  const pr = result?.items?.find((r) => r.code === paymentRequestCode);
  if (!pr) return { ok: false, reason: "Payment request not found" };
  if (pr.status === "Expired" || pr.status === "Cancelled") {
    return { ok: false, reason: `Payment request ${pr.status.toLowerCase()}` };
  }
  if (pr.status !== "Paid") {
    return { ok: false, reason: `Payment not confirmed (status: ${pr.status})` };
  }

  markSpent(paymentRequestCode);
  return { ok: true, receipt: paymentRequestCode };
}

// ─── Algorand exact scheme ────────────────────────────────────────────────────

async function verifyAlgorandProof(
  xPayment: string,
  amountEur: number,
  resource?: string
): Promise<VerifyResult> {
  if (!ALGO_MERCHANT_ADDRESS) {
    return { ok: false, reason: "Algorand payments not configured on this merchant" };
  }

  const atomicAmount = Math.round(amountEur * Math.pow(10, EURD_DECIMALS));

  const settleReq = {
    x402Version: 2,
    paymentPayload: xPayment,
    paymentRequirements: {
      scheme: "exact",
      network: "algorand:mainnet",
      maxAmountRequired: String(atomicAmount),
      resource: resource ?? "",
      description: "x402 payment",
      mimeType: "application/json",
      payTo: ALGO_MERCHANT_ADDRESS,
      maxTimeoutSeconds: 300,
      asset: EURD_ASA_ID,
    },
  };

  let settleRes: Response;
  try {
    settleRes = await fetch(`${ALGO_FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settleReq),
    });
  } catch (err) {
    return { ok: false, reason: `Facilitator unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }

  let body: { success?: boolean; txHash?: string; errorReason?: string };
  try {
    body = await settleRes.json() as typeof body;
  } catch {
    return { ok: false, reason: "Invalid response from facilitator" };
  }

  if (!body.success) {
    return { ok: false, reason: body.errorReason ?? "Settlement failed" };
  }

  return { ok: true, receipt: body.txHash ?? "confirmed" };
}

// ─── Algorand bridge scheme (EURO→EURD via Quantoz API) ───────────────────────

const ALGONODE_INDEXER = "https://mainnet-idx.algonode.cloud";
const BRIDGE_POLL_INTERVAL_MS = 3000;
const BRIDGE_POLL_MAX_ATTEMPTS = 10; // up to 30 seconds waiting for blockchainTxId

/**
 * Verify an Algorand bridge payment.
 *
 * Flow:
 *  1. Poll the Quantoz API with the transactionCode until blockchainTxId appears
 *     (Quantoz populates this once on-chain settlement completes, ~1-3 min)
 *  2. Verify the specific Algorand transaction by ID via the indexer:
 *     - correct asset (EURD ASA)
 *     - amount >= required
 *     - receiver matches merchant payTo address
 *
 * This is replay-proof: we verify the exact transaction, not just any recent
 * transfer to the merchant address.
 */
async function verifyAlgorandBridgeProof(
  payload: { transactionCode: string; payTo: string; asset: string },
  amountEur: number
): Promise<VerifyResult> {
  const { transactionCode, payTo, asset } = payload;

  if (isSpent(transactionCode)) {
    return { ok: false, reason: "Payment already used" };
  }

  if (!transactionCode || !payTo || !asset) {
    return { ok: false, reason: "Bridge proof missing required fields" };
  }

  const atomicAmount = Math.round(amountEur * Math.pow(10, EURD_DECIMALS));
  const client = new EurdClient();

  // ── Step 1: Poll Quantoz API until blockchainTxId is available ──────────────
  let blockchainTxId: string | undefined;

  for (let attempt = 0; attempt < BRIDGE_POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, BRIDGE_POLL_INTERVAL_MS));
    }

    try {
      const result = await client.getTransaction(transactionCode);
      const tx: TransactionListItem | undefined = result?.items?.[0];

      if (!tx) {
        return { ok: false, reason: `Transaction ${transactionCode} not found` };
      }

      if (tx.status === "Cancelled" || tx.status === "Expired") {
        return { ok: false, reason: `Transaction ${tx.status.toLowerCase()}` };
      }

      if (tx.blockchainTxId) {
        blockchainTxId = tx.blockchainTxId;
        break;
      }
    } catch {
      // API error — keep polling
    }
  }

  if (!blockchainTxId) {
    return {
      ok: false,
      reason: `Bridge payment on-chain settlement not yet complete (transactionCode: ${transactionCode})`,
    };
  }

  // ── Step 2: Verify the specific Algorand transaction by ID ──────────────────
  try {
    const url = `${ALGONODE_INDEXER}/v2/transactions/${blockchainTxId}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      return { ok: false, reason: `Could not fetch Algorand transaction ${blockchainTxId}` };
    }

    const data = await res.json() as {
      transaction?: {
        "asset-transfer-transaction"?: {
          "asset-id": number;
          amount: number;
          receiver: string;
        };
      };
    };

    const axfer = data.transaction?.["asset-transfer-transaction"];
    if (!axfer) {
      return { ok: false, reason: "Blockchain transaction is not an asset transfer" };
    }

    if (String(axfer["asset-id"]) !== asset) {
      return { ok: false, reason: `Wrong asset: expected ${asset}, got ${axfer["asset-id"]}` };
    }

    if (axfer.receiver !== payTo) {
      return { ok: false, reason: `Wrong receiver: expected ${payTo}, got ${axfer.receiver}` };
    }

    if (axfer.amount < atomicAmount) {
      return { ok: false, reason: `Insufficient amount: expected ${atomicAmount}, got ${axfer.amount}` };
    }
  } catch (err) {
    return {
      ok: false,
      reason: `Algorand indexer error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  markSpent(transactionCode);
  return { ok: true, receipt: blockchainTxId };
}
