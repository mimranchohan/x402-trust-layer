import type { Request, Response, NextFunction } from "express";

/**
 * Extract payer identity from x402 PAYMENT-SIGNATURE or MPP / Stripe agent headers
 * (MolTrust-style: X-Agent-Id, Authorization bearer with agent subject).
 */
export function attachPaymentIdentity(req: Request, _res: Response, next: NextFunction): void {
  const mppAgentId =
    (req.headers["x-agent-id"] as string | undefined)?.trim() ||
    (req.headers["x-mpp-agent-id"] as string | undefined)?.trim();

  if (mppAgentId) {
    (req as Request & { mppAgentId?: string }).mppAgentId = mppAgentId;
  }

  const paymentSig = (req.headers["payment-signature"] as string | undefined)?.trim();
  if (paymentSig) {
    try {
      const decoded = JSON.parse(Buffer.from(paymentSig, "base64").toString("utf8")) as {
        payload?: { from?: string };
        accepted?: { payTo?: string; network?: string };
      };
      const payer = decoded.payload?.from;
      if (payer) {
        (req as Request & { x402Payer?: string }).x402Payer = payer;
      }
      if (decoded.accepted?.network) {
        (req as Request & { x402PaymentNetwork?: string }).x402PaymentNetwork =
          decoded.accepted.network;
      }
    } catch {
      // ignore malformed signature — paid middleware will reject
    }
  }

  next();
}
