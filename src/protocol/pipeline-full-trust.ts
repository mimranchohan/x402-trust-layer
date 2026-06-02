import { config } from "../config.js";
import { runPreX402Guard } from "../agents/pre-x402-guard.js";
import { issueAgentPassport } from "./agent-passport.js";
import { computeTrustScoreV2 } from "./trust-score-v2.js";
import { runFraudScan } from "./fraud-engine.js";
import { runTrustOracleConsensus } from "./trust-oracle.js";
import { createReplayBinding } from "./replay-guard.js";
import { computeAgentCreditScore } from "./credit-bureau.js";
import { assessCompliance } from "./compliance-v2.js";
import { recordProtocolMetric } from "./observability.js";

export type FullTrustPipelineInput = {
  agentId: string;
  walletAddress: string;
  targetUrl: string;
  estimatedCostUsdc: number;
  organizationId?: string;
  policy: {
    dailyCapUsdc: number;
    perCallCapUsdc: number;
    allowedHosts?: string[];
  };
};

export async function runFullTrustPipeline(input: FullTrustPipelineInput) {
  await recordProtocolMetric("pipeline.full_trust.start", { agentId: input.agentId });

  const passport = await issueAgentPassport({
    agentId: input.agentId,
    walletAddress: input.walletAddress,
  });

  const trustV2 = await computeTrustScoreV2({
    agentId: input.agentId,
    walletAddress: input.walletAddress,
  });

  const fraud = await runFraudScan({
    agentId: input.agentId,
    walletAddress: input.walletAddress,
    merchantHost: new URL(input.targetUrl).hostname,
    amountUsdc: input.estimatedCostUsdc,
  });

  const oracle = await runTrustOracleConsensus({
    subjectType: "agent",
    subjectId: input.agentId,
    claims: { trustScore: trustV2.trustScore, fraudScore: fraud.fraudScore },
  });

  const credit = await computeAgentCreditScore({
    agentId: input.agentId,
    walletAddress: input.walletAddress,
  });

  const compliance = assessCompliance({
    organizationId: input.organizationId ?? "default-org",
    agentId: input.agentId,
    monthlyVolumeUsdc: input.estimatedCostUsdc * 30,
  });

  const replayBinding = await createReplayBinding({
    agentId: input.agentId,
    resourceUrl: input.targetUrl,
    requestBody: { estimatedCostUsdc: input.estimatedCostUsdc },
  });

  const guard = await runPreX402Guard({
    agentId: input.agentId,
    walletAddress: input.walletAddress,
    targetUrl: input.targetUrl,
    estimatedCostUsdc: input.estimatedCostUsdc,
    policy: input.policy,
    minTrustScore: 50,
  });

  const allowed =
    guard.allowed &&
    fraud.fraudScore < 60 &&
    oracle.consensus &&
    compliance.allowed &&
    credit.creditScore >= 500;

  await recordProtocolMetric("pipeline.full_trust.complete", {
    agentId: input.agentId,
    allowed: String(allowed),
  });

  return {
    status: "ok",
    allowed,
    summary: allowed
      ? "Full trust pipeline passed — safe to proceed with x402 payment"
      : "Full trust pipeline blocked — review fraud, oracle, compliance, or guard",
    passport: { did: passport.did, riskTier: passport.riskTier },
    trustV2,
    fraud,
    oracle,
    credit,
    compliance,
    replayBinding: {
      bindingId: replayBinding.bindingId,
      header: "X-Trust-Replay-Binding",
      nonce: replayBinding.nonce,
      expiresAt: replayBinding.expiresAt,
    },
    guard: {
      allowed: guard.allowed,
      securityGrade: guard.securityGrade,
      summary: guard.summary,
    },
    nextSteps: allowed
      ? [
          `Attach header X-Trust-Replay-Binding: ${replayBinding.bindingId}`,
          "Pay target with x402_fetch / OpenDexter",
          "POST /api/protocol/execution/issue with tool trace + settlement",
        ]
      : ["Review blockers", "POST /api/protocol/fraud/scan for detail"],
    protocolVersion: "4.0.0",
    docs: `${config.publicBaseUrl}/api/protocol/architecture`,
  };
}
