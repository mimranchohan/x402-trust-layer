/** Supported x402 settlement networks (CAIP-2) */
export const CHAIN_IDS = {
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  base: "eip155:8453",
  polygon: "eip155:137",
} as const;

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
  const list = out.length ? out : ["solana"];
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
