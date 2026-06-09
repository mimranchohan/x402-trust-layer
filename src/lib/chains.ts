/** Supported x402 settlement networks (CAIP-2) */
export const CHAIN_IDS = {
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  base: "eip155:8453",
  polygon: "eip155:137",
  base_sepolia: "eip155:84532",
  solana_devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
} as const;

export type ChainKey = keyof typeof CHAIN_IDS;

/** USDC token address / mint per chain (Agentic + CDP expect network-correct asset) */
export const USDC_ASSET: Record<ChainKey, string> = {
  solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c335",
  base_sepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  solana_devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPEPBNLW2nN2H4V2",
};

/**
 * EURC (Euro Coin) -- Circle's EUR-backed stablecoin.
 * Keyrock 2026 risk report: USDC 98.6% concentration -> EURC as EUR-denominated fallback.
 * x402 V2 multi-rail: agents in EU / SEPA zones prefer EURC for MiCA compliance.
 */
export const EURC_ASSET: Partial<Record<ChainKey, string>> = {
  base: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1aDB42",
  polygon: "0xc52D7F23a2e460248Db6eE192Cb23dD12BDDcbf6",
};

/**
 * PYUSD (PayPal USD) -- PayPal + Paxos, NYDFS-regulated.
 * x402 V2 fallback for US-regulated commerce flows (Stripe MPP compatible).
 */
export const PYUSD_ASSET: Partial<Record<ChainKey, string>> = {
  base: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8",
  polygon: "0xd8cB8f79E46BB93f1fA17D8F4bE4F24Bb7c31ff",
};

/**
 * USDT (Tether) -- highest global liquidity, tertiary fallback.
 */
export const USDT_ASSET: Partial<Record<ChainKey, string>> = {
  base: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  polygon: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
};

/** Supported stablecoin rails in priority order (x402 V2 multi-stablecoin) */
export type StablecoinRail = "USDC" | "EURC" | "PYUSD" | "USDT";
export const STABLECOIN_RAILS: StablecoinRail[] = ["USDC", "EURC", "PYUSD", "USDT"];

/** Resolve token contract address for a stablecoin rail on a specific chain. */
export function stablecoinAsset(
  rail: StablecoinRail,
  chain: ChainKey,
): string | undefined {
  switch (rail) {
    case "USDC": return USDC_ASSET[chain];
    case "EURC": return EURC_ASSET[chain];
    case "PYUSD": return PYUSD_ASSET[chain];
    case "USDT": return USDT_ASSET[chain];
  }
}

/**
 * All available stablecoins on a chain, in priority order.
 * Used to build x402 V2 multi-stablecoin `accepts` array -- payer picks first match.
 */
export function availableStablecoins(
  chain: ChainKey,
): Array<{ rail: StablecoinRail; asset: string }> {
  const result: Array<{ rail: StablecoinRail; asset: string }> = [];
  for (const rail of STABLECOIN_RAILS) {
    const asset = stablecoinAsset(rail, chain);
    if (asset) result.push({ rail, asset });
  }
  return result;
}

export function usdcAssetForCaip2(network: string): string | undefined {
  for (const key of Object.keys(CHAIN_IDS) as ChainKey[]) {
    if (CHAIN_IDS[key] === network) return USDC_ASSET[key];
  }
  return undefined;
}

const CHAIN_ALIASES: Record<string, ChainKey> = {
  "base-sepolia": "base_sepolia",
  base_sepolia: "base_sepolia",
  "solana-devnet": "solana_devnet",
  solana_devnet: "solana_devnet",
};

export function parseChainList(raw: string | undefined): ChainKey[] {
  if (!raw || raw === "all") return ["base", "solana", "polygon"];
  const keys = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: ChainKey[] = [];
  for (const k of keys) {
    const resolved = (CHAIN_ALIASES[k] ?? k) as ChainKey;
    if (resolved in CHAIN_IDS && !out.includes(resolved)) out.push(resolved);
  }
  // Preserve the operator-specified order so NETWORKS controls which chain is
  // advertised first in the 402 `accepts` list (and therefore preferred by payers).
  return out.length ? out : ["solana"];
}

export function caip2Networks(chains: ChainKey[]): string[] {
  return chains.map((c) => CHAIN_IDS[c]);
}

/** Human chain keys -> CAIP-2 (x402 v2 discovery). */
export const NETWORK_ALIAS_TO_CAIP2: Record<string, string> = {
  base: CHAIN_IDS.base,
  solana: CHAIN_IDS.solana,
  polygon: CHAIN_IDS.polygon,
  "base-sepolia": CHAIN_IDS.base_sepolia,
  base_sepolia: CHAIN_IDS.base_sepolia,
  "solana-devnet": CHAIN_IDS.solana_devnet,
  solana_devnet: CHAIN_IDS.solana_devnet,
};

export function normalizeToCaip2(network: string): string {
  const trimmed = network.trim();
  if (trimmed.includes(":")) return trimmed;
  return NETWORK_ALIAS_TO_CAIP2[trimmed.toLowerCase()] ?? trimmed;
}

export function isEvmChain(chain: ChainKey): boolean {
  return chain === "base" || chain === "polygon" || chain === "base_sepolia";
}

export function isTestnetChain(chain: ChainKey): boolean {
  return chain === "base_sepolia" || chain === "solana_devnet";
}

export function detectChainFromAddress(address: string): ChainKey | null {
  if (/^0x[a-fA-F0-9]{40}$/.test(address.trim())) return "base";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim())) return "solana";
  return null;
}
