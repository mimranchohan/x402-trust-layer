import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { parseChainList, caip2Networks, type ChainKey } from "./lib/chains.js";

dotenv.config();

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function resolvePublicBaseUrl(port: number): string {
  const raw = env("PUBLIC_BASE_URL");
  let url = "";
  if (raw) url = raw.replace(/\/$/, "");
  else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    url = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  } else if (process.env.RENDER_EXTERNAL_URL) {
    url = process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  } else {
    url = `http://127.0.0.1:${port}`;
  }

  if (url.startsWith("http://") && !url.includes("127.0.0.1") && !url.includes("localhost")) {
    url = `https://${url.slice(7)}`;
  }
  return url;
}

function resolveAttestationHmacSecret(): string {
  const configured = env("ATTESTATION_HMAC_SECRET");
  if (configured.length >= 32) return configured;

  const isProd =
    process.env.NODE_ENV === "production" ||
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RAILWAY_PUBLIC_DOMAIN;

  if (isProd) {
    throw new Error(
      "ATTESTATION_HMAC_SECRET is required in production (32+ chars). Generate: openssl rand -hex 32",
    );
  }

  const fallback = env("ATTESTATION_DEV_SECRET");
  if (fallback.length >= 16) return fallback;
  return `dev-${randomBytes(16).toString("hex")}`;
}

const chains = parseChainList(
  env("NETWORKS") || env("NETWORK") || (env("PAY_TO_EVM") ? "base,solana" : "solana,base"),
);

export const config = {
  port: Number(process.env.PORT ?? 3402),
  publicBaseUrl: resolvePublicBaseUrl(Number(process.env.PORT ?? 3402)),
  payTo: env("PAY_TO_ADDRESS") || env("PAY_TO"),
  payToEvm: env("PAY_TO_EVM") || env("PAY_TO_ADDRESS_EVM") || "",
  chains,
  networks: caip2Networks(chains),
  primaryChain: (chains[0] ?? "solana") as ChainKey,
  facilitatorUrl: env("FACILITATOR_URL") || "https://x402.dexter.cash",
  baseRpcUrl: env("BASE_RPC_URL") || "https://mainnet.base.org",
  network: (chains[0] ?? "solana") as ChainKey,
  attestationHmacSecret: resolveAttestationHmacSecret(),
  allowVerifierProbeIds: env("ALLOW_VERIFIER_PROBE_IDS") === "1",
};

export const pricing = {
  paymentCompiler: "0.15",
  facilitatorFailover: "0.05",
  mppBroker: "0.02",
  mppSessionV2: "0.03",
  spendGovernor: "0.03",
  identityGate: "0.05",
  riskGate: "0.08",
  apiRouter: "0.02",
  researchBrief: "0.20",
  receiptAuditor: "0.05",
  refundArbiter: "0.08",
  budgetAllocator: "0.03",
  settlementGraph: "0.02",
  qualityMonitor: "0.03",
  evidenceLocker: "0.10",
  agentEscrow: "0.12",
  preX402Guard: "0.05",
  pipelineExecute: "0.25",
  x402Proxy: "0.08",
  attestationIssue: "0.04",
  attestationVerify: "0.02",
  trustRegistry: "0.02",
  marketBuyAdvisor: "0.08",
  auditionCoach: "0.06",
  merchantTrust: "0.06",
  mandateCompile: "0.08",
  mandateVerify: "0.02",
  railOptimizer: "0.04",
  complianceLedger: "0.12",
  disputeResolve: "0.10",
  qualityEscrow: "0.10",
} as const;

export function assertConfig(): void {
  if (!config.payTo) {
    throw new Error(
      "Missing PAY_TO_ADDRESS. Set it in Railway/Render Variables (or .env locally) to your USDC receive wallet.",
    );
  }
}
