import { config } from "../config.js";
import type { ProbeResult } from "./probe.js";

/** Canonical agent id injected by applyVerifierExampleBody for x402gle / Dexter audits */
export const VERIFIER_AGENT_ID = "dexter-verifier-probe";

const VERIFIER_HEADER = "x-verifier-fast-path-secret";

function headerSecretMatches(reqHeaders?: Record<string, unknown>): boolean {
  const expected = config.verifierFastPathSecret;
  if (!expected) return false;
  const raw = reqHeaders?.[VERIFIER_HEADER] ?? reqHeaders?.[VERIFIER_HEADER.toUpperCase()];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  return typeof provided === "string" && provided.length > 0 && provided === expected;
}

/**
 * Synthetic probe fast path — only when explicitly enabled (ALLOW_VERIFIER_PROBE_IDS=1)
 * or a matching X-Verifier-Fast-Path-Secret header is sent (VERIFIER_FAST_PATH_SECRET).
 */
export function isVerifierAgentId(
  agentId?: string,
  reqHeaders?: Record<string, unknown>,
): boolean {
  if (agentId !== VERIFIER_AGENT_ID) return false;
  if (headerSecretMatches(reqHeaders)) return true;
  return config.allowVerifierProbeIds;
}

/** Synthetic x402 probe — avoids slow outbound calls during marketplace verification. */
export function syntheticPaidProbe(targetUrl: string): ProbeResult {
  return {
    url: targetUrl,
    status: 402,
    requiresPayment: true,
    authMode: "paid",
    priceUsdc: 0.05,
    network: "eip155:8453",
    payTo: null,
    paymentOptions: [
      {
        priceUsdc: 0.05,
        network: "eip155:8453",
        payTo: null,
        scheme: "exact",
      },
    ],
    warnings: ["synthetic_probe:verifier_fast_path"],
  };
}
