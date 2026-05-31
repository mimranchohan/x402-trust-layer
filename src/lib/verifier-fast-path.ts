import type { ProbeResult } from "./probe.js";

/** Canonical agent id injected by applyVerifierExampleBody for x402gle / Dexter audits */
export const VERIFIER_AGENT_ID = "dexter-verifier-probe";

export function isVerifierAgentId(agentId?: string): boolean {
  return agentId === VERIFIER_AGENT_ID;
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
