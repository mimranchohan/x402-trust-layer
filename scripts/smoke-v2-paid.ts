/**
 * One-shot paid smoke: semantic-settle on production (uses .env EVM/SOL keys).
 * Usage: npx tsx scripts/smoke-v2-paid.ts
 */
import dotenv from "dotenv";
import { wrapFetch } from "@dexterai/x402/client";
import { assertPayerKeys, buildWrapFetchOptions } from "../src/lib/x402-client-options.js";

dotenv.config();

const base = (process.env.PUBLIC_BASE_URL ?? "https://x402trustlayer.xyz").replace(/\/$/, "");

assertPayerKeys();
const x402Fetch = wrapFetch(
  fetch,
  buildWrapFetchOptions({ verbose: process.env.X402_VERBOSE === "1" }),
);

const body = {
  action: "settle",
  deliveryIntent: "ETH/USD spot oracle price with symbol",
  payerAgentId: "live-smoke-v2",
  payeeMerchant: "api.myceliasignal.com",
  amountUsdc: 0.05,
  releaseThreshold: 72,
  expectedProfile: { requiredKeys: ["price", "symbol"], forbidEmpty: true },
  actualResponse: {
    bodyKeys: ["price", "symbol"],
    byteLength: 48,
    empty: false,
    fields: { price: 3450.12, symbol: "ETH" },
    sample: '{"price":3450.12,"symbol":"ETH"}',
  },
};

const path = "/api/quality-escrow/semantic-settle";
console.log(`POST ${base}${path}\n`);

let res: Response | null = null;
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    res = await x402Fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    break;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const extra =
      err && typeof err === "object" && "responseBody" in err
        ? String((err as { responseBody?: unknown }).responseBody)
        : "";
    if (extra) console.error("Server body:", extra.slice(0, 800));
    const reasonMatch = msg.match(/"reason"\s*:\s*"([^"]+)"/) ?? extra.match(/"reason"\s*:\s*"([^"]+)"/);
    if (reasonMatch) console.error("Facilitator reason:", reasonMatch[1]);
    if (attempt === 1 && /settlement failed|payment was rejected/i.test(msg)) {
      console.warn(`Retry in 4.5s after: ${msg}\n`);
      await new Promise((r) => setTimeout(r, 4500));
      continue;
    }
    throw err;
  }
}
if (!res) process.exit(1);

const text = await res.text();
console.log(`Status: ${res.status}\n`);
console.log(text.slice(0, 2000));

if (!res.ok) process.exit(1);
const j = JSON.parse(text) as { decision?: string; judgeMode?: string; combinedScore?: number };
console.log(`\n✓ decision=${j.decision} judgeMode=${j.judgeMode} combinedScore=${j.combinedScore}`);
