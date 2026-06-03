import { db } from "./db.js";

const checkNonce = db.prepare("SELECT 1 AS ok FROM used_nonces WHERE nonce = ?");
const insertNonce = db.prepare(
  "INSERT OR IGNORE INTO used_nonces (nonce, network) VALUES (?, ?)",
);
const cleanOld = db.prepare("DELETE FROM used_nonces WHERE used_at < ?");

/** True if this nonce was already used for a successful settlement. */
export function isNonceAlreadyUsed(nonce: string): boolean {
  if (!nonce || nonce.length < 8) return false;
  return !!checkNonce.get(nonce);
}

/** Record nonce only after facilitator settlement succeeds. */
export function markNonceUsed(nonce: string, network: string): void {
  if (!nonce || nonce.length < 8) return;
  if (Math.random() < 0.02) {
    cleanOld.run(Math.floor(Date.now() / 1000) - 86_400);
  }
  insertNonce.run(nonce, network || "unknown");
}

export function checkAndConsumeNonce(nonce: string, network: string): boolean {
  if (!nonce || nonce.length < 8) return true;
  if (isNonceAlreadyUsed(nonce)) return false;
  markNonceUsed(nonce, network);
  return true;
}

export function extractNonceFromPaymentHeader(header: string): {
  nonce?: string;
  network?: string;
  payTo?: string;
} {
  try {
    const parsed = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    const payload = parsed.payload as Record<string, unknown> | undefined;
    const accepted = parsed.accepted as Record<string, unknown> | undefined;
    const nonce =
      (typeof payload?.nonce === "string" && payload.nonce) ||
      (typeof parsed.nonce === "string" && parsed.nonce) ||
      undefined;
    const network =
      (typeof accepted?.network === "string" && accepted.network) ||
      (typeof parsed.network === "string" && parsed.network) ||
      undefined;
    const payTo =
      (typeof accepted?.payTo === "string" && accepted.payTo) ||
      (typeof payload?.authorization === "object" &&
        payload.authorization !== null &&
        typeof (payload.authorization as { to?: string }).to === "string" &&
        (payload.authorization as { to: string }).to) ||
      undefined;
    return { nonce, network, payTo };
  } catch {
    return {};
  }
}
