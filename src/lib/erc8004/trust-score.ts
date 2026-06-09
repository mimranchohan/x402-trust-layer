import type { Address } from "viem";
import { config } from "../../config.js";
import { logger } from "../logger.js";
import {
  fetchAgentCard,
  scoreAgentCard,
  verifyWellKnown,
} from "./agent-card.js";
import { cacheGet, cacheKey, cacheSet } from "./cache.js";
import {
  isEvmAddress,
  tierForScore,
  TRUST_SCORE_WEIGHTS,
  type TrustTier,
} from "./constants.js";
import {
  chainMeta,
  readAgentWallet,
  readOwnerOf,
  readReputationSummary,
  readTokenUri,
} from "./registry.js";
import { resolveAgentId } from "./resolve-agent.js";

export type TrustScoreBreakdown = {
  onChainRegistration: number;
  reputation: number;
  walletVerified: number;
  agentCard: number;
  domainWellKnown: number;
  paymentHistory: number;
};

export type TrustScoreResult = {
  walletAddress: string;
  agentId: string | null;
  chain: ReturnType<typeof chainMeta>;
  trustScore: number;
  tier: TrustTier;
  breakdown: TrustScoreBreakdown;
  registered: boolean;
  owner: string | null;
  agentWallet: string | null;
  agentUri: string | null;
  reputationCount: number;
  resolutionSource: "body" | "alchemy" | "none";
  guidance: string | null;
  cached: boolean;
  flags: string[];
};

function reputationPoints(summary: {
  count: bigint;
  summaryValue: bigint;
  summaryValueDecimals: number;
} | null): number {
  if (!summary || summary.count === 0n) return 0;

  const max = TRUST_SCORE_WEIGHTS.reputation;
  const decimals = summary.summaryValueDecimals;
  const raw = Number(summary.summaryValue);
  const normalized =
    decimals > 0 ? raw / 10 ** decimals : raw;

  // ERC-8004 feedback is typically 0–100; clamp and scale to 0–25.
  const clamped = Math.max(0, Math.min(100, normalized));
  const volumeBoost = summary.count >= 5n ? 1 : Number(summary.count) / 5;
  return Math.round((clamped / 100) * max * volumeBoost);
}

const RPC_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.TRUSTSCORE_RPC_TIMEOUT_MS ?? "8000"),
);

function withRpcTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("rpc_timeout")), ms),
    ),
  ]);
}

export async function computeTrustScore(input: {
  walletAddress: string;
  agentId?: string | number;
  skipCache?: boolean;
}): Promise<TrustScoreResult> {
  const wallet = input.walletAddress.trim();
  if (!isEvmAddress(wallet)) {
    return {
      walletAddress: wallet,
      agentId: null,
      chain: chainMeta(),
      trustScore: 0,
      tier: "UNKNOWN",
      breakdown: {
        onChainRegistration: 0,
        reputation: 0,
        walletVerified: 0,
        agentCard: 0,
        domainWellKnown: 0,
        paymentHistory: 0,
      },
      registered: false,
      owner: null,
      agentWallet: null,
      agentUri: null,
      reputationCount: 0,
      resolutionSource: "none",
      guidance: "Invalid or missing EVM wallet address",
      cached: false,
      flags: ["invalid_wallet"],
    };
  }

  const ttl = config.trustScoreCacheTtlSec;
  const key = cacheKey(["trustscore", wallet.toLowerCase(), input.agentId ?? ""]);
  if (!input.skipCache) {
    const hit = cacheGet<TrustScoreResult>(key);
    if (hit) return { ...hit, cached: true };
  }

  const ZERO_BREAKDOWN: TrustScoreBreakdown = {
    onChainRegistration: 0, reputation: 0, walletVerified: 0,
    agentCard: 0, domainWellKnown: 0, paymentHistory: 0,
  };

  const result = await withRpcTimeout(
    (async (): Promise<TrustScoreResult> => {
      const flags: string[] = [];
      const resolved = await resolveAgentId(wallet as Address, input.agentId);
      const agentId = resolved.agentId;

      let onChainRegistration = 0;
      let owner: string | null = null;
      let agentWallet: string | null = null;
      let agentUri: string | null = null;
      let reputationCount = 0;
      let reputation = 0;
      let walletVerified = 0;
      let agentCardPts = 0;
      let domainPts = 0;

      if (agentId != null) {
        onChainRegistration = TRUST_SCORE_WEIGHTS.onChainRegistration;
        owner = (await readOwnerOf(agentId)) ?? null;
        if (owner && owner.toLowerCase() !== wallet.toLowerCase()) {
          flags.push("wallet_not_owner");
          onChainRegistration = Math.round(TRUST_SCORE_WEIGHTS.onChainRegistration * 0.5);
        }

        const verifiedWallet = await readAgentWallet(agentId);
        agentWallet = verifiedWallet;
        if (
          verifiedWallet &&
          verifiedWallet.toLowerCase() === wallet.toLowerCase()
        ) {
          walletVerified = TRUST_SCORE_WEIGHTS.walletVerified;
        }

        const rep = await readReputationSummary(agentId);
        reputationCount = rep ? Number(rep.count) : 0;
        reputation = reputationPoints(rep);

        agentUri = await readTokenUri(agentId);
        if (agentUri) {
          const card = await fetchAgentCard(agentUri);
          const cardScore = scoreAgentCard(card, agentUri);
          agentCardPts = cardScore.points;
          if (!cardScore.valid) flags.push("incomplete_agent_card");

          const wellKnown = await verifyWellKnown(cardScore.domain);
          domainPts = wellKnown.points;
          if (!wellKnown.verified && cardScore.domain) flags.push("domain_not_verified");
        } else {
          flags.push("missing_agent_uri");
        }
      } else if (resolved.guidance) {
        flags.push("unregistered");
      }

      // Phase 2 — payment history from Trust Layer ledger (stub 0).
      const paymentHistory = 0;

      const breakdown: TrustScoreBreakdown = {
        onChainRegistration,
        reputation,
        walletVerified,
        agentCard: agentCardPts,
        domainWellKnown: domainPts,
        paymentHistory,
      };

      const trustScore = Object.values(breakdown).reduce((a, b) => a + b, 0);
      const tier = tierForScore(trustScore);

      return {
        walletAddress: wallet,
        agentId: agentId != null ? agentId.toString() : null,
        chain: chainMeta(),
        trustScore,
        tier,
        breakdown,
        registered: agentId != null,
        owner,
        agentWallet,
        agentUri,
        reputationCount,
        resolutionSource: resolved.source,
        guidance: resolved.guidance,
        cached: false,
        flags,
      };
    })(),
    RPC_TIMEOUT_MS,
  ).catch((err: unknown) => {
    const isTimeout = err instanceof Error && err.message === "rpc_timeout";
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), wallet },
      isTimeout
        ? "[trust-score] RPC timeout — returning UNVERIFIED fallback"
        : "[trust-score] RPC error — returning UNVERIFIED fallback",
    );
    return {
      walletAddress: wallet,
      agentId: null,
      chain: chainMeta(),
      trustScore: 0,
      tier: "UNVERIFIED" as TrustTier,
      breakdown: ZERO_BREAKDOWN,
      registered: false,
      owner: null,
      agentWallet: null,
      agentUri: null,
      reputationCount: 0,
      resolutionSource: "none" as const,
      guidance: isTimeout ? "Trust score RPC timed out" : "Trust score RPC error",
      cached: false,
      flags: [isTimeout ? "rpc_timeout" : "rpc_error"],
    };
  });

  cacheSet(key, result, ttl);
  return result;
}

export function meetsMinTier(current: TrustTier, required: TrustTier): boolean {
  const order: TrustTier[] = ["PLATINUM", "GOLD", "SILVER", "BRONZE", "UNVERIFIED", "UNKNOWN"];
  return order.indexOf(current) <= order.indexOf(required);
}
