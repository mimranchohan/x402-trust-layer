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

/** Human chain keys → CAIP-2 (x402 v2 discovery). */
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
