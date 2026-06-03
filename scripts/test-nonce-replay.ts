/**
 * Nonce / idempotency replay guards (no network).
 * Usage: npx tsx scripts/test-nonce-replay.ts
 */
import { claimNonceKey, isNonceKeyUsed } from "../src/lib/nonce-store.js";
import {
  isNonceAlreadyUsed,
  markNonceUsed,
  isIdempotencyKeyConsumed,
  markIdempotencyKeyUsed,
} from "../src/lib/x402-payment-replay.js";

let failed = 0;

async function assert(cond: boolean, msg: string): Promise<void> {
  if (!cond) {
    console.error("FAIL", msg);
    failed++;
  } else {
    console.log("ok", msg);
  }
}

const nonce = `test_nonce_${Date.now()}_${Math.random().toString(16).slice(2)}`;

await assert(!isNonceAlreadyUsed(nonce), "fresh payment nonce");
await markNonceUsed(nonce, "eip155:8453");
await assert(isNonceAlreadyUsed(nonce), "payment nonce marked used");

const proto = `proto_${nonce.slice(0, 24)}`;
const first = await claimNonceKey(`proto:${proto}`, "protocol");
await assert(first, "proto first claim");
const second = await claimNonceKey(`proto:${proto}`, "protocol");
await assert(!second, "proto replay blocked");

const idemReq = {
  headers: { "idempotency-key": `idem-${nonce}` },
} as { headers: Record<string, unknown> };
const path = "/api/guard/pre-x402";
await assert(!isIdempotencyKeyConsumed(idemReq, path), "idempotency fresh");
await markIdempotencyKeyUsed(idemReq, path);
await assert(isIdempotencyKeyConsumed(idemReq, path), "idempotency consumed after settlement");

await assert(isNonceKeyUsed(`pay:${nonce}`), "pay prefix in store");

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll nonce replay tests passed");
