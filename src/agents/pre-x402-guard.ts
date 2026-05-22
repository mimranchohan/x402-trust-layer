import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";
import { assessUrlSecurity } from "../lib/security.js";
import { runIdentityGate } from "./identity-gate.js";
import { runRiskGate } from "./risk-gate.js";
import { runSpendGovernor } from "./spend-governor.js";
import type { SpendGovernorInput } from "../types.js";

export type PreX402GuardInput = {
  agentId: string;
  walletAddress: string;
  targetUrl: string;
  estimatedCostUsdc: number;
  network?: string;
  policy: SpendGovernorInput["policy"];
  maxTierSpendUsdc?: number;
};

export type PreX402GuardResult = {
  allowed: boolean;
  summary: string;
  securityGrade: string;
  savingsVsSeparateUsdc: number;
  spend: Awaited<ReturnType<typeof runSpendGovernor>>;
  identity: ReturnType<typeof runIdentityGate>;
  risk: Awaited<ReturnType<typeof runRiskGate>>;
  integrationHint: string;
  overlapNote: string;
};

/** One paid call before x402_fetch — spend + identity + risk (replaces 3 separate calls). */
export async function runPreX402Guard(
  input: PreX402GuardInput,
): Promise<WithAgentTrust<PreX402GuardResult>> {
  const spendInput: SpendGovernorInput = {
    agentId: input.agentId,
    estimatedCostUsdc: input.estimatedCostUsdc,
    targetUrl: input.targetUrl,
    network: input.network,
    policy: input.policy,
  };

  const [spend, risk] = await Promise.all([
    runSpendGovernor(spendInput),
    runRiskGate({
      targetUrl: input.targetUrl,
      estimatedCostUsdc: input.estimatedCostUsdc,
      policy: {
        perCallCapUsdc: input.policy.perCallCapUsdc,
        blockedHosts: input.policy.blockedHosts,
      },
    }),
  ]);

  const identity = runIdentityGate({
    walletAddress: input.walletAddress,
    maxTierSpendUsdc: input.maxTierSpendUsdc ?? input.policy.perCallCapUsdc * 20,
  });

  const blockers: string[] = [];
  if (!spend.allowed) blockers.push(`spend: ${spend.reason}`);
  if (!identity.allowed) blockers.push(`identity: ${identity.reasons.join("; ")}`);
  if (!risk.safe) blockers.push(`risk: ${risk.reasons.join("; ") || `score ${risk.riskScore}`}`);

  const urlSec = assessUrlSecurity(input.targetUrl);
  const allowed = blockers.length === 0 && urlSec.grade !== "F";

  const checks = [
    "spend_governor",
    "identity_gate",
    "risk_gate",
    "url_security_grade",
  ];
  if (allowed) checks.push("policy_pass");

  const payload: PreX402GuardResult = {
    allowed,
    securityGrade: urlSec.grade,
    summary: allowed
      ? "Safe to proceed with x402 payment on targetUrl"
      : `Blocked — ${blockers.join(" | ")}`,
    savingsVsSeparateUsdc: 0.11,
    spend,
    identity,
    risk,
    overlapNote:
      "Spend, identity, and risk are also available as separate endpoints; this bundle runs them in one call.",
    integrationHint:
      "Call POST /api/guard/pre-x402 once before every x402_fetch / OpenDexter paid call.",
  };

  return withAgentTrust(
    payload,
    agentTrustMeta(checks, {
      confidence: allowed ? 0.86 : 0.72,
      sources: ["spend-governor", "identity-gate", "risk-gate", "url-security"],
    }),
  );
}
