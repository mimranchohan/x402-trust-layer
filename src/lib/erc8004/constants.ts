/** Official ERC-8004 Base Mainnet — do not use Sepolia addresses in production. */
export const ERC8004_CAIP2 = "eip155:8453" as const;
export const ERC8004_CHAIN_ID = 8453;

export const DEFAULT_IDENTITY_REGISTRY =
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
export const DEFAULT_REPUTATION_REGISTRY =
  "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;

export const TRUST_TIERS = ["PLATINUM", "GOLD", "SILVER", "BRONZE", "UNVERIFIED", "UNKNOWN"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

export const TIER_THRESHOLDS: { tier: Exclude<TrustTier, "UNKNOWN">; minScore: number }[] = [
  { tier: "PLATINUM", minScore: 85 },
  { tier: "GOLD", minScore: 70 },
  { tier: "SILVER", minScore: 50 },
  { tier: "BRONZE", minScore: 30 },
  { tier: "UNVERIFIED", minScore: 0 },
];

export const TRUST_SCORE_WEIGHTS = {
  onChainRegistration: 30,
  reputation: 25,
  walletVerified: 15,
  agentCard: 15,
  domainWellKnown: 10,
  paymentHistory: 5,
} as const;

export function tierForScore(score: number): Exclude<TrustTier, "UNKNOWN"> {
  for (const { tier, minScore } of TIER_THRESHOLDS) {
    if (score >= minScore) return tier;
  }
  return "UNVERIFIED";
}

export function tierRank(tier: TrustTier): number {
  const order: TrustTier[] = ["PLATINUM", "GOLD", "SILVER", "BRONZE", "UNVERIFIED", "UNKNOWN"];
  return order.indexOf(tier);
}

export function isEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}
