import { AsyncLocalStorage } from "node:async_hooks";
import type { Request } from "express";

export type PaymentRequestStore = Request & {
  x402PendingNonce?: { nonce: string; network: string };
};

export const paymentRequestAls = new AsyncLocalStorage<PaymentRequestStore>();

export function getPaymentRequestStore(): PaymentRequestStore | undefined {
  return paymentRequestAls.getStore();
}
