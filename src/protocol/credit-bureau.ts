import { computeTrustScoreV2 } from "./trust-score-v2.js";
import { readProtocolStoreKey, writeProtocolStoreKey } from "./store.js";

export type CreditScoreInput = {
  agentId: string;
  walletAddress: string;
  disputeCount?: number;
  settlementCount?: number;
  uptimePct?: number;
};

export type CreditScoreResult = {
  creditScore: number;
  band: "exceptional" | "good" | "fair" | "poor" | "high_risk";
  range: "300-900";
  factors: Record<string, number>;
  limits: { suggestedDailyCapUsdc: number; suggestedPerCallCapUsdc: number };
};

export async function computeAgentCreditScore(input: CreditScoreInput): Promise<CreditScoreResult> {
  const trust = await computeTrustScoreV2({
    agentId: input.agentId,
    walletAddress: input.walletAddress,
    disputeRatePct: (input.disputeCount ?? 0) * 2,
    uptimePct: input.uptimePct ?? 95,
  });

  const key = input.agentId;
  const agentHistory = await readProtocolStoreKey<{ scores: number[] }>("credit-bureau", key, { scores: [] });
  const prev = agentHistory.scores ?? [];
  const settlements = input.settlementCount ?? prev.length;
  const reliability = Math.min(200, settlements * 4);
  const disputePenalty = Math.min(150, (input.disputeCount ?? 0) * 25);

  const raw = 300 + trust.trustScore * 4 + reliability - disputePenalty;
  const creditScore = Math.round(Math.max(300, Math.min(900, raw)));

  const band: CreditScoreResult["band"] =
    creditScore >= 800
      ? "exceptional"
      : creditScore >= 700
        ? "good"
        : creditScore >= 600
          ? "fair"
          : creditScore >= 500
            ? "poor"
            : "high_risk";

  const updatedHistory = { scores: [...prev, creditScore].slice(-50) };
  await writeProtocolStoreKey("credit-bureau", key, updatedHistory);

  return {
    creditScore,
    band,
    range: "300-900",
    factors: {
      trust_v2: trust.trustScore,
      settlement_history: reliability,
      dispute_penalty: -disputePenalty,
      uptime: input.uptimePct ?? 95,
    },
    limits: {
      suggestedDailyCapUsdc: creditScore >= 700 ? 50 : creditScore >= 600 ? 10 : 2,
      suggestedPerCallCapUsdc: creditScore >= 700 ? 2 : creditScore >= 600 ? 0.5 : 0.1,
    },
  };
}
