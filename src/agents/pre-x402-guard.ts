import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";
import { assessUrlSecurity } from "../lib/security.js";
import { isVerifierAgentId } from "../lib/verifier-fast-path.js";
import { isEvmAddress, type TrustTier } from "../lib/erc8004/constants.js";
import { computeTrustScore, meetsMinTier } from "../lib/erc8004/trust-score.js";
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
  minAgentTier?: TrustTier;
  minTrustScore?: number;
  requestHeaders?: Record<string, unknown>;
};

export type PreX402GuardResult = {
  allowed: boolean;
  summary: string;
  securityGrade: string;
  savingsVsSeparateUsdc: number;
  spend: Awaited<ReturnType<typeof runSpendGovernor>>;
  identity: Awaited<ReturnType<typeof runIdentityGate>>;
  risk: Awaited<ReturnType<typeof runRiskGate>>;
  agentTrust: { tier: TrustTier; trustScore: number } | null;
  integrationHint: string;
  overlapNote: string;
};

const GUARD_TIMEOUT_MS = Math.max(
  2_000,
  Number(process.env.PRE_X402_GUARD_TIMEOUT_MS ?? "12000"),
);

/** One paid call before x402_fetch — spend + identity + risk (replaces 3 separate calls). */
export async function runPreX402Guard(
  input: PreX402GuardInput,
): Promise<WithAgentTrust<PreX402GuardResult>> {
  return Promise.race([
    (async (): Promise<WithAgentTrust<PreX402GuardResult>> => {
  const spendInput: SpendGovernorInput = {
    agentId: input.agentId,
    estimatedCostUsdc: input.estimatedCostUsdc,
    targetUrl: input.targetUrl,
    network: input.network,
    policy: input.policy,
  };

  const [spend, risk, identity] = await Promise.all([
    runSpendGovernor(spendInput),
    runRiskGate({
      targetUrl: input.targetUrl,
      estimatedCostUsdc: input.estimatedCostUsdc,
      fastProbe: isVerifierAgentId(input.agentId, input.requestHeaders),
      policy: {
        perCallCapUsdc: input.policy.perCallCapUsdc,
        blockedHosts: input.policy.blockedHosts,
      },
    }),
    runIdentityGate({
      walletAddress: input.walletAddress,
      maxTierSpendUsdc: input.maxTierSpendUsdc ?? input.policy.perCallCapUsdc * 20,
    }),
  ]);

  let agentTrust: PreX402GuardResult["agentTrust"] = null;
  if (isEvmAddress(input.walletAddress) && (input.minAgentTier || input.minTrustScore != null)) {
    const trust = await computeTrustScore({ walletAddress: input.walletAddress });
    agentTrust = { tier: trust.tier, trustScore: trust.trustScore };
  }

  const blockers: string[] = [];
  if (!spend.allowed) blockers.push(`spend: ${spend.reason}`);
  if (!identity.allowed) blockers.push(`identity: ${identity.reasons.join("; ")}`);
  if (!risk.safe) blockers.push(`risk: ${risk.reasons.join("; ") || `score ${risk.riskScore}`}`);
  if (agentTrust && input.minAgentTier && !meetsMinTier(agentTrust.tier, input.minAgentTier)) {
    blockers.push(`agent_tier: ${agentTrust.tier} below min ${input.minAgentTier}`);
  }
  if (
    agentTrust &&
    typeof input.minTrustScore === "number" &&
    agentTrust.trustScore < input.minTrustScore
  ) {
    blockers.push(`trust_score: ${agentTrust.trustScore} below min ${input.minTrustScore}`);
  }

  const urlSec = assessUrlSecurity(input.targetUrl);
  const allowed = blockers.length === 0 && urlSec.grade !== "F";

  const checks = [
    "spend_governor",
    "identity_gate",
    "risk_gate",
    "url_security_grade",
  ];
  if (agentTrust) checks.push("erc8004_trust_score");
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
    agentTrust,
    overlapNote:
      "Spend, identity, and risk are also available as separate endpoints; this bundle runs them in one call.",
    integrationHint:
      "Call POST /api/guard/pre-x402 once before every x402_fetch / OpenDexter paid call.",
  };

  return withAgentTrust(
    payload,
    agentTrustMeta(checks, {
      confidence: allowed ? 0.86 : 0.72,
      sources: ["spend-governor", "identity-gate", "risk-gate", "url-security", "erc-8004"],
    }),
  );
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`pre-x402-guard timed out after ${GUARD_TIMEOUT_MS}ms`)),
        GUARD_TIMEOUT_MS,
      ),
    ),
  ]);
}

