import { wrapFetch } from "@dexterai/x402/client";

const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const DEFAULT_SOLANA_RPC = "https://api.mainnet-beta.solana.com";

function wrapOptions(wallet: PreflightWallet) {
  const rpcUrls = { [SOLANA_MAINNET]: DEFAULT_SOLANA_RPC };
  if ("solanaPrivateKey" in wallet && wallet.solanaPrivateKey) {
    return { walletPrivateKey: wallet.solanaPrivateKey, rpcUrls };
  }
  return {
    evmPrivateKey: wallet.evmPrivateKey!,
    preferredNetwork: "eip155:8453" as const,
    rpcUrls,
  };
}

export const DEFAULT_SUITE_BASE =
  "https://x402trustlayer.xyz";

export type PreflightPolicy = {
  dailyCapUsdc: number;
  perCallCapUsdc: number;
  allowedHosts?: string[];
  blockedHosts?: string[];
};

export type PreflightWallet =
  | { solanaPrivateKey: string; evmPrivateKey?: never }
  | { evmPrivateKey: string; solanaPrivateKey?: never };

export type ProxyPreflightResult = {
  allowed: boolean;
  summary: string;
  securityGrade?: string;
  attestationId?: string;
  raw: unknown;
};

/**
 * One paid call: guard + security grade + optional attestation before downstream x402_fetch.
 */
export async function proxyPreflight(options: {
  baseUrl?: string;
  wallet: PreflightWallet;
  agentId: string;
  walletAddress: string;
  targetUrl: string;
  estimatedCostUsdc: number;
  policy: PreflightPolicy;
  issueAttestation?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<ProxyPreflightResult> {
  const base = (options.baseUrl ?? DEFAULT_SUITE_BASE).replace(/\/$/, "");
  const x402Fetch = wrapFetch(options.fetchImpl ?? fetch, wrapOptions(options.wallet));

  const res = await x402Fetch(`${base}/api/x402/proxy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: options.agentId,
      walletAddress: options.walletAddress,
      targetUrl: options.targetUrl,
      estimatedCostUsdc: options.estimatedCostUsdc,
      policy: options.policy,
      issueAttestation: options.issueAttestation ?? true,
    }),
  });

  const raw = (await res.json()) as {
    allowed?: boolean;
    summary?: string;
    securityGrade?: string;
    attestation?: { attestationId?: string };
  };

  if (!res.ok) {
    throw new Error(`proxy preflight HTTP ${res.status}: ${JSON.stringify(raw)}`);
  }

  return {
    allowed: raw.allowed === true,
    summary: raw.summary ?? "unknown",
    securityGrade: raw.securityGrade,
    attestationId: raw.attestation?.attestationId,
    raw,
  };
}

export async function guardPreflight(options: {
  baseUrl?: string;
  wallet: PreflightWallet;
  agentId: string;
  walletAddress: string;
  targetUrl: string;
  estimatedCostUsdc: number;
  policy: PreflightPolicy;
  network?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProxyPreflightResult> {
  const base = (options.baseUrl ?? DEFAULT_SUITE_BASE).replace(/\/$/, "");
  const x402Fetch = wrapFetch(options.fetchImpl ?? fetch, wrapOptions(options.wallet));

  const res = await x402Fetch(`${base}/api/guard/pre-x402`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: options.agentId,
      walletAddress: options.walletAddress,
      targetUrl: options.targetUrl,
      estimatedCostUsdc: options.estimatedCostUsdc,
      network: options.network,
      policy: options.policy,
    }),
  });

  const raw = (await res.json()) as { allowed?: boolean; summary?: string; securityGrade?: string };
  if (!res.ok) throw new Error(`guard preflight HTTP ${res.status}: ${JSON.stringify(raw)}`);

  return {
    allowed: raw.allowed === true,
    summary: raw.summary ?? "unknown",
    securityGrade: raw.securityGrade,
    raw,
  };
}
