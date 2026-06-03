import { config, isAllowedNetwork } from "../config.js";

const TRUSTED_PAY_TO = new Set(
  [config.payTo, config.payToEvm].filter(Boolean).map((a) => a.toLowerCase()),
);

export function isTrustedPayTo(payTo: string | undefined): boolean {
  if (!payTo) return false;
  return TRUSTED_PAY_TO.has(payTo.toLowerCase());
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
