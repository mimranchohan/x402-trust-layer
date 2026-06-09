import { runAgentVerify } from "../agents/agent-verify.js";
import { hmacSign, sha256Hex } from "./crypto.js";
import { readProtocolStore, writeProtocolStore } from "./store.js";

export type TrustScoreV2Input = {
  agentId: string;
  walletAddress: string;
  disputeRatePct?: number;
  refundRatePct?: number;
  uptimePct?: number;
  slaCompliancePct?: number;
  deliveryQualityScore?: number;
  stakeWeightUsdc?: number;
  counterpartyCount?: number;
  economicValueUsdc?: number;
};

export type TrustScoreV2Result = {
  trustScore: number;
  tier: string;
  dimensions: Record<string, number>;
  sybilResistance: { clusterRisk: number; flags: string[] };
  proof: {
    algorithm: "trustscore-v2-hmac";
    digest: string;
    signature: string;
    issuedAt: string;
  };
  erc8004?: { trustScore: number; tier: string; registered: boolean };
};

type HistoryStore = Record<string, { scores: number[]; updatedAt: string }>;

export async function computeTrustScoreV2(input: TrustScoreV2Input): Promise<TrustScoreV2Result> {
  let erc8004: TrustScoreV2Result["erc8004"];
  try {
    const v = await runAgentVerify({
      walletAddress: input.walletAddress,
      agentId: input.agentId,
    });
    erc8004 = {
      trustScore: v.trustScore,
      tier: v.tier,
      registered: v.registered,
    };
  } catch {
    erc8004 = { trustScore: 0, tier: "UNKNOWN", registered: false };
  }

  const base = erc8004.trustScore * 0.45;
  const success = Math.min(25, 25 - (input.disputeRatePct ?? 2) * 2);
  const delivery = Math.min(15, (input.deliveryQualityScore ?? 70) * 0.15);
  const uptime = Math.min(10, (input.uptimePct ?? 95) * 0.1);
  const sla = Math.min(10, (input.slaCompliancePct ?? 90) * 0.1);
  const stake = Math.min(10, Math.log10(1 + (input.stakeWeightUsdc ?? 0)) * 5);
  const diversity = Math.min(10, Math.min(10, (input.counterpartyCount ?? 1) * 2));

  const raw = base + success + delivery + uptime + sla + stake + diversity;
  const trustScore = Math.round(Math.max(0, Math.min(100, raw)));

  const history = await readProtocolStore<HistoryStore>("trust-history", {});
  const key = sha256Hex(`${input.agentId}:${input.walletAddress}`).slice(0, 24);
  const prev = history[key]?.scores ?? [];
  const scores = [...prev, trustScore].slice(-20);
  history[key] = { scores, updatedAt: new Date().toISOString() };
  await writeProtocolStore("trust-history", history);

  const variance =
    scores.length > 1
      ? scores.reduce((a, b) => a + Math.abs(b - trustScore), 0) / scores.length
      : 0;
  const flags: string[] = [];
  if ((input.refundRatePct ?? 0) > 15) flags.push("high_refund_rate");
  if (variance > 25) flags.push("unstable_trust_history");
  if (!erc8004.registered) flags.push("no_erc8004_registration");

  const dimensions = {
    erc8004_base: Math.round(base),
    transaction_success: Math.round(success),
    delivery_quality: Math.round(delivery),
    uptime: Math.round(uptime),
    sla: Math.round(sla),
    stake: Math.round(stake),
    counterparty_diversity: Math.round(diversity),
  };

  const digest = sha256Hex(JSON.stringify({ agentId: input.agentId, trustScore, dimensions }));
  const proof = {
    algorithm: "trustscore-v2-hmac" as const,
    digest,
    signature: hmacSign(digest),
    issuedAt: new Date().toISOString(),
  };

  const tier =
    trustScore >= 85
      ? "PLATINUM"
      : trustScore >= 70
        ? "GOLD"
        : trustScore >= 50
          ? "SILVER"
          : trustScore >= 30
            ? "BRONZE"
            : "UNVERIFIED";

  return {
    trustScore,
    tier,
    dimensions,
    sybilResistance: { clusterRisk: Math.min(100, flags.length * 20), flags },
    proof,
    erc8004,
  };
}
