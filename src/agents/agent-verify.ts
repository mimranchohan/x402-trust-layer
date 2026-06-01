import type { Request, Response } from "express";
import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";
import { isEvmAddress, type TrustTier } from "../lib/erc8004/constants.js";
import { computeTrustScore, type TrustScoreResult } from "../lib/erc8004/trust-score.js";

export type AgentVerifyInput = {
  walletAddress: string;
  agentId?: string | number;
  skipCache?: boolean;
};

export type AgentVerifyResult = WithAgentTrust<
  TrustScoreResult & {
    recommendation: string;
    integrationHint: string;
  }
>;

function recommendationFor(tier: TrustTier, registered: boolean): string {
  if (!registered) {
    return "Register on ERC-8004 IdentityRegistry (Base mainnet) before high-value x402 spend";
  }
  switch (tier) {
    case "PLATINUM":
      return "Premium access — suitable for high-cap production agents";
    case "GOLD":
      return "Production-ready — standard fleet integration";
    case "SILVER":
      return "Limited access — complete agent card and domain verification to upgrade";
    case "BRONZE":
      return "Minimal profile — add reputation feedback and verify wallet binding";
    default:
      return "Unverified — on-chain registration required for trust signals";
  }
}

export async function runAgentVerify(input: AgentVerifyInput): Promise<AgentVerifyResult> {
  const score = await computeTrustScore(input);

  const checks = ["erc8004_chain_read"];
  if (score.registered) checks.push("identity_registry");
  if (score.breakdown.reputation > 0) checks.push("reputation_registry");
  if (score.breakdown.walletVerified > 0) checks.push("agent_wallet_verified");
  if (score.breakdown.agentCard > 0) checks.push("agent_card");
  if (score.breakdown.domainWellKnown > 0) checks.push("domain_well_known");

  const confidence = score.registered
    ? 0.88 + Math.min(0.1, score.trustScore / 1000)
    : isEvmAddress(input.walletAddress)
      ? 0.75
      : 0.4;

  return withAgentTrust(
    {
      ...score,
      recommendation: recommendationFor(score.tier, score.registered),
      integrationHint:
        "Call POST /api/agent/verify before guard when minAgentTier is required; cache TTL ~2 min.",
    },
    agentTrustMeta(checks, {
      confidence,
      sources: ["erc-8004-identity-registry", "erc-8004-reputation-registry", "x402-trust-layer"],
      accuracy_note:
        "TrustScore reads Base mainnet ERC-8004 registries; payment history dimension ships in phase 2.",
    }),
  );
}

export async function handleAgentLookup(req: Request, res: Response): Promise<void> {
  const wallet = String(req.params.wallet ?? "").trim();
  if (!isEvmAddress(wallet)) {
    res.status(400).json({ error: "Invalid EVM wallet address" });
    return;
  }
  const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
  const score = await computeTrustScore({ walletAddress: wallet, agentId });
  res.json({
    walletAddress: score.walletAddress,
    agentId: score.agentId,
    trustScore: score.trustScore,
    tier: score.tier,
    breakdown: score.breakdown,
    registered: score.registered,
    guidance: score.guidance,
    cached: score.cached,
    freeTier: true,
  });
}
