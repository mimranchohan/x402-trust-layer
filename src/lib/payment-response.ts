/**
 * Parse x402 v2 PAYMENT-RESPONSE header (base64 JSON).
 */
export type ParsedPaymentResponse = {
  transaction?: string;
  txHash?: string;
  payer?: string;
  network?: string;
  amountUsdc?: number;
  raw: Record<string, unknown>;
};

export function parsePaymentResponseHeader(headerValue: string | null): ParsedPaymentResponse | null {
  if (!headerValue?.trim()) return null;
  try {
    const json = Buffer.from(headerValue.trim(), "base64").toString("utf8");
    const raw = JSON.parse(json) as Record<string, unknown>;
    const tx =
      (typeof raw.transaction === "string" && raw.transaction) ||
      (typeof raw.txHash === "string" && raw.txHash) ||
      undefined;
    let amountUsdc: number | undefined;
    if (typeof raw.amount === "number") amountUsdc = raw.amount;
    else if (typeof raw.amountUsdc === "number") amountUsdc = raw.amountUsdc;
    else if (typeof raw.amount === "string") {
      amountUsdc = Number(raw.amount) / 1_000_000;
    } else if (typeof raw.maxAmountRequired === "string") {
      amountUsdc = Number(raw.maxAmountRequired) / 1_000_000;
    }
    if (raw.success === true && !amountUsdc) amountUsdc = 1;
    return {
      transaction: tx,
      txHash: tx,
      payer: typeof raw.payer === "string" ? raw.payer : undefined,
      network: typeof raw.network === "string" ? raw.network : undefined,
      amountUsdc,
      raw,
    };
  } catch {
    return null;
  }
}

export function paymentResponseFromHeaders(headers: Headers): ParsedPaymentResponse | null {
  const h = headers.get("PAYMENT-RESPONSE") ?? headers.get("payment-response");
  return parsePaymentResponseHeader(h);
}
