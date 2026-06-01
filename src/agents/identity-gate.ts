import { isEvmAddress, type TrustTier } from "../lib/erc8004/constants.js";
import { computeTrustScore } from "../lib/erc8004/trust-score.js";

const BLOCKED_PATTERNS = ["test", "burn", "11111111111111111111111111111111"];

export type IdentityGateInput = {
  walletAddress: string;
  maxTierSpendUsdc?: number;
  requireMainnet?: boolean;
};

export type IdentityGateResult = {
  allowed: boolean;
  tier: "trusted" | "standard" | "restricted";
  riskScore: number;
  maxSpendUsdc: number;
  reasons: string[];
  erc8004?: {
    trustScore: number;
    tier: TrustTier;
    agentId: string | null;
    registered: boolean;
  };
};

function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

export async function runIdentityGate(input: IdentityGateInput): Promise<IdentityGateResult> {
  const reasons: string[] = [];
  let riskScore = 10;
  const addr = input.walletAddress.trim();

  if (!isSolanaAddress(addr) && !isEvmAddress(addr)) {
    return {
      allowed: false,
      tier: "restricted",
      riskScore: 100,
      maxSpendUsdc: 0,
      reasons: ["Invalid wallet address format"],
    };
  }

  const lower = addr.toLowerCase();
  for (const p of BLOCKED_PATTERNS) {
    if (lower.includes(p)) {
      reasons.push(`Matched blocked pattern: ${p}`);
      riskScore += 60;
    }
  }

  if (addr.length < 32) {
    reasons.push("Address suspiciously short");
    riskScore += 30;
  }

  let erc8004: IdentityGateResult["erc8004"];
  if (isEvmAddress(addr)) {
    const trust = await computeTrustScore({ walletAddress: addr });
    erc8004 = {
      trustScore: trust.trustScore,
      tier: trust.tier,
      agentId: trust.agentId,
      registered: trust.registered,
    };
    if (trust.registered && trust.tier !== "UNVERIFIED" && trust.tier !== "UNKNOWN") {
      riskScore = Math.max(0, riskScore - 15);
      reasons.push(`ERC-8004 ${trust.tier} (score ${trust.trustScore})`);
    } else if (!trust.registered) {
      reasons.push("No ERC-8004 registration — consider POST /api/agent/verify");
    }
  }

  let tier: IdentityGateResult["tier"] = "standard";
  if (riskScore < 25) tier = "trusted";
  if (riskScore >= 50) tier = "restricted";

  const maxSpend =
    tier === "trusted"
      ? (input.maxTierSpendUsdc ?? 50)
      : tier === "standard"
        ? Math.min(input.maxTierSpendUsdc ?? 10, 10)
        : 0;

  return {
    allowed: tier !== "restricted",
    tier,
    riskScore,
    maxSpendUsdc: maxSpend,
    reasons: reasons.length ? reasons : ["Wallet passed baseline checks"],
    ...(erc8004 ? { erc8004 } : {}),
  };
}
