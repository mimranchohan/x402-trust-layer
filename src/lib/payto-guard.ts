import { config, isAllowedNetwork } from "../config.js";

export function isTrustedPayTo(payTo: string | undefined): boolean {
  if (!payTo) return false;
  const lower = payTo.toLowerCase();
  return (
    lower === config.payTo.toLowerCase() ||
    (!!config.payToEvm && lower === config.payToEvm.toLowerCase())
  );
}

export function validateIncomingPaymentRequirements(requirements: {
  payTo?: string;
  network?: string;
}): { ok: true } | { ok: false; error: string } {
  if (requirements.network && !isAllowedNetwork(requirements.network)) {
    return { ok: false, error: `Network not allowed: ${requirements.network}` };
  }
  if (requirements.payTo && !isTrustedPayTo(requirements.payTo)) {
    return {
      ok: false,
      error: "Payment address mismatch — possible payTo redirect attack",
    };
  }
  return { ok: true };
}
