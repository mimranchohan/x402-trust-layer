import { issueMandate, verifyMandate, type MandateCheck, type MandateScope } from "../lib/mandate.js";
import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";
import { config } from "../config.js";

export type MandateCompileInput = {
  principal: string;
  agentId: string;
  intent: string;
  maxPerTxUsdc: number;
  dailyCapUsdc: number;
  allowedMerchants?: string[];
  allowedCategories?: string[];
  allowedRails?: string[];
  ttlMinutes?: number;
};

/**
 * AP2-style Mandate Compiler + Verifiable Intent Notary.
 * Converts a human intent + guardrails into a cryptographically signed, scoped
 * mandate (the "tamper-resistant intent" layer that Google AP2 and Visa CLI
 * governance both require). Agents present the mandate; merchants/fleets verify
 * the proposed payment fits the signed scope before money moves.
 */
export async function runMandateCompile(input: MandateCompileInput) {
  const ttl = input.ttlMinutes ?? 1440;
  const scope: MandateScope = {
    maxPerTxUsdc: input.maxPerTxUsdc,
    dailyCapUsdc: input.dailyCapUsdc,
    allowedMerchants: input.allowedMerchants ?? [],
    allowedCategories: input.allowedCategories ?? [],
    allowedRails: input.allowedRails ?? [],
    expiresAt: new Date(Date.now() + ttl * 60_000).toISOString(),
  };
  const record = await issueMandate({
    principal: input.principal,
    agentId: input.agentId,
    intent: input.intent,
    scope,
  });
  return withAgentTrust(
    {
      mandate: record,
      verifyUrl: `${config.publicBaseUrl}/api/mandate/verify`,
      usage:
        "Present mandateId to merchants/fleet controllers; they POST it to /api/mandate/verify with the proposed payment to confirm scope.",
    },
    agentTrustMeta(["intent_hashed", "scope_bound", "hmac_signed"], {
      confidence: 0.92,
      sources: ["mandate-notary", "ap2-aligned"],
      accuracy_note:
        "Mandate is HMAC-signed and tamper-evident; binding to a real cardholder/Visa CLI principal is the integrator's responsibility.",
    }),
  );
}

export type MandateVerifyInput = {
  mandateId: string;
  proposed?: MandateCheck;
};

export async function runMandateVerify(input: MandateVerifyInput) {
  const result = await verifyMandate(input.mandateId, input.proposed);
  const allowed = result.valid && result.withinScope;
  return withAgentTrust(
    {
      ok: true,
      allowed,
      valid: result.valid,
      withinScope: result.withinScope,
      reason: result.reason,
      record: result.record,
      violations: result.violations,
      mandateId: input.mandateId,
      proposed: input.proposed ?? null,
    },
    agentTrustMeta(
      result.valid
        ? result.withinScope
          ? ["signature_ok", "scope_ok", "not_expired"]
          : ["signature_ok", "scope_violation"]
        : ["signature_or_lookup_failed"],
      {
        confidence: result.valid ? 0.93 : 0.6,
        sources: ["mandate-notary", "hmac-verify"],
      },
    ),
  );
}
