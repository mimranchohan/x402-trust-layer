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
};

function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

function isEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export function runIdentityGate(input: IdentityGateInput): IdentityGateResult {
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
  };
}
