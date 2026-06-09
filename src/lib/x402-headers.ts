import type { Request, Response } from "express";

/** x402 HTTP transport v2 header names (December 2025+). */
export const PAYMENT_SIGNATURE = "payment-signature";
export const PAYMENT_RESPONSE = "PAYMENT-RESPONSE";
export const PAYMENT_REQUIRED = "PAYMENT-REQUIRED";

/** Read client payment signature (v2 primary, v1 legacy for probes). */
export function getPaymentSignatureHeader(req: Request): string | undefined {
  const raw =
    req.headers[PAYMENT_SIGNATURE] ??
    req.headers["x-payment"] ??
    req.headers["x402-payment"];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}

export function hasPaymentSignatureHeader(req: Request): boolean {
  return Boolean(getPaymentSignatureHeader(req));
}

/** Normalize settlement response header reads (v2 + legacy). */
export function getPaymentResponseHeader(res: Response): string | undefined {
  const h = res.getHeader(PAYMENT_RESPONSE) ?? res.getHeader("payment-response");
  if (typeof h === "string") return h;
  if (Array.isArray(h)) return h[0];
  return undefined;
}
