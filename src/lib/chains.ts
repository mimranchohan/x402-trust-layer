/** Supported x402 settlement networks (CAIP-2) */
export const CHAIN_IDS = {
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  base: "eip155:8453",
  polygon: "eip155:137",
} as const;

/** USDC token address / mint per chain (Agentic + CDP expect network-correct asset) */
export const USDC_ASSET: Record<ChainKey, string> = {
  solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03f5e335",
};

export function usdcAssetForCaip2(network: string): string | undefined {
  for (const key of Object.keys(CHAIN_IDS) as ChainKey[]) {
    if (CHAIN_IDS[key] === network) return USDC_ASSET[key];
  }
  return undefined;
}

export type ChainKey = keyof typeof CHAIN_IDS;

const CHAIN_ORDER: ChainKey[] = ["base", "solana", "polygon"];

export function parseChainList(raw: string | undefined): ChainKey[] {
  if (!raw || raw === "all") return ["base", "solana"];
  const keys = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: ChainKey[] = [];
  for (const k of keys) {
    if (k in CHAIN_IDS && !out.includes(k as ChainKey)) out.push(k as ChainKey);
  }
  const list: ChainKey[] = out.length ? out : ["solana"];
  return [...list].sort((a, b) => CHAIN_ORDER.indexOf(a) - CHAIN_ORDER.indexOf(b));
}

export function caip2Networks(chains: ChainKey[]): string[] {
  return chains.map((c) => CHAIN_IDS[c]);
}

export function isEvmChain(chain: ChainKey): boolean {
  return chain === "base" || chain === "polygon";
}

export function detectChainFromAddress(address: string): ChainKey | null {
  if (/^0x[a-fA-F0-9]{40}$/.test(address.trim())) return "base";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim())) return "solana";
  return null;
}
