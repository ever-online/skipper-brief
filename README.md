# SkipperBrief

A sailing weather AI that sells tailored passage briefs for €0.50 — paid with EURD via the Quantoz x402 protocol.

**Live demo:** [skipper.ever-online.com](https://skipper.ever-online.com)

---

## What it demonstrates

- **Consumer flow** — 3-step wizard (boat type → region → payment), QR code payment via the [Quantoz EURD Wallet app](https://apps.apple.com/gb/app/quantoz-eurd-wallet/id6444851825), PDF download
- **Agent flow** — the `/api/forecast` endpoint is x402-protected; any agent with a Quantoz account can pay and receive the PDF programmatically with no human in the loop
- **Two payment schemes** — `euro` (off-chain managed accounts) and `exact` on `algorand:mainnet` (on-chain EURD via bridge)

## Stack

- [Next.js 15](https://nextjs.org) (App Router)
- [Tailwind CSS](https://tailwindcss.com)
- [Claude claude-sonnet-4-6](https://anthropic.com) — writes the AI sailing brief
- [Open-Meteo Marine API](https://open-meteo.com) — wind, waves, swell, ocean currents
- [Quantoz EURD](https://dev.quantoz.ai) — x402 payment gate

---

## Agent endpoint

The forecast endpoint is x402-protected. Call it with [`@ever_amsterdam/x402-euro-eurd`](https://www.npmjs.com/package/@ever_amsterdam/x402-euro-eurd) and payment is handled automatically:

```typescript
import { withEurPayment } from "@ever_amsterdam/x402-euro-eurd";

const fetch = withEurPayment(globalThis.fetch, {
  apiKey: process.env.QUANTOZ_API_KEY,
  fromAccount: process.env.QUANTOZ_ACCOUNT,
});

const res = await fetch(
  "https://skipper.ever-online.com/api/forecast?region=dutch-north-sea&boatType=sailing&boatSize=medium"
);
const pdf = await res.arrayBuffer();
```

**Available regions:** `dutch-north-sea`, `wadden-sea`, `ijsselmeer`, `english-channel`, `central-north-sea`, `skagerrak-kattegat`, `western-baltic`, `irish-sea`, `bay-of-biscay`, `western-mediterranean`

**Boat types:** `sailing`, `motor`  
**Boat sizes:** `small`, `medium`, `large`

---

## Running locally

### Prerequisites

- Node.js 22+
- A [Quantoz account](https://dev.quantoz.ai/getting-started/signup/) with API key and account code
- An [Anthropic API key](https://console.anthropic.com)

### Setup

```bash
git clone https://github.com/ever-online/skipper-brief
cd skipper-brief
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```bash
EURD_API_KEY=your-quantoz-api-key
EURD_ACCOUNT_CODE=ACC_xxx
QUANTOZ_BASE_URL=https://api.quantozpay.com

ANTHROPIC_API_KEY=sk-ant-...

PUBLIC_URL=http://localhost:3003
```

To also accept on-chain EURD payments (optional), add:

```bash
ALGORAND_MERCHANT_ADDRESS=your-whitelisted-algorand-address
ALGORAND_FACILITATOR_URL=https://x402algo.ai.quantozpay.com
EURD_ASA_ID=1221682136
```

### Run

```bash
npm run dev
# → http://localhost:3003
```

---

## How payments work

### Consumer (QR code)

1. User completes the 3-step wizard and is shown a QR code
2. User scans with the [Quantoz EURD Wallet app](https://apps.apple.com/gb/app/quantoz-eurd-wallet/id6444851825) and confirms €0.50
3. Webhook confirms payment → PDF is generated and downloaded

### Agent (x402)

1. Agent calls `GET /api/forecast?region=...&boatType=...&boatSize=...`
2. Server returns `402` with `accepts` for the `euro` scheme (and optionally `exact`/Algorand)
3. Agent pays via Quantoz API, retries with `X-PAYMENT` proof header
4. Server verifies → returns PDF bytes

See the [Quantoz x402 docs](https://dev.quantoz.ai/x402/agent/) for the full agent integration guide.

---

## Docs

Full integration documentation at [dev.quantoz.ai](https://dev.quantoz.ai)
