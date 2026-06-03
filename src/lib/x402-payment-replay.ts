import {
  claimNonceKey,
  extractIdempotencyKey,
  isNonceKeyUsed,
} from "./nonce-store.js";

export { extractIdempotencyKey };

/** True if this nonce was already used for a successful settlement. */
export function isNonceAlreadyUsed(nonce: string): boolean {
  return isNonceKeyUsed(`pay:${nonce}`);
}

/** Record nonce only after facilitator settlement succeeds. */
export async function markNonceUsed(nonce: string, network: string): Promise<void> {
  await claimNonceKey(`pay:${nonce}`, network || "unknown");
}

export async function checkAndConsumeNonce(nonce: string, network: string): Promise<boolean> {
  if (!nonce || nonce.length < 8) return true;
  if (isNonceKeyUsed(`pay:${nonce}`)) return false;
  return claimNonceKey(`pay:${nonce}`, network);
}

export function idempotencyCompositeKey(
  req: { headers: Record<string, unknown> },
  resourcePath: string,
): string | undefined {
  const key = extractIdempotencyKey(req);
  if (!key) return undefined;
  return `idem:${resourcePath}:${key}`;
}

/** Block only after a prior request with this key completed settlement. */
export function isIdempotencyKeyConsumed(
  req: { headers: Record<string, unknown> },
  resourcePath: string,
): boolean {
  const composite = idempotencyCompositeKey(req, resourcePath);
  return composite ? isNonceKeyUsed(composite) : false;
}

export async function markIdempotencyKeyUsed(
  req: { headers: Record<string, unknown> },
  resourcePath: string,
): Promise<void> {
  const composite = idempotencyCompositeKey(req, resourcePath);
  if (!composite) return;
  await claimNonceKey(composite, "idempotency", 86_400);
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
