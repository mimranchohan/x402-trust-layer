import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { parseChainList, caip2Networks, type ChainKey } from "./lib/chains.js";

dotenv.config();

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

const DEFAULT_CANONICAL_ORIGIN = "https://x402trustlayer.xyz";

function resolvePublicBaseUrl(port: number): string {
  const raw = env("PUBLIC_BASE_URL") || env("CANONICAL_PUBLIC_URL");
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

function resolveChains(): ChainKey[] {
  if (env("X402_TESTNET") === "1" || env("TESTNET") === "1") {
    return parseChainList(env("NETWORKS") || "base-sepolia,solana-devnet");
  }
  return parseChainList(env("NETWORKS") || env("NETWORK") || "base,solana,polygon");
}

const chains = resolveChains();

/** CDP facilitator — required for CDP Bazaar catalog indexing on agentic.market */
export const CDP_FACILITATOR_URL =
  "https://api.cdp.coinbase.com/platform/v2/x402/facilitator";

function resolveFacilitatorUrl(): string {
  const explicit = env("FACILITATOR_URL");
  if (explicit) return explicit;
  if (env("X402_TESTNET") === "1" || env("TESTNET") === "1") {
    return "https://x402.org/facilitator";
  }
  if (env("USE_CDP_FACILITATOR") === "1" || env("AGENTIC_CDP") === "1") {
    return CDP_FACILITATOR_URL;
  }
  return "https://x402.dexter.cash";
}

export const config = {
  port: Number(process.env.PORT ?? 3402),
  publicBaseUrl: resolvePublicBaseUrl(Number(process.env.PORT ?? 3402)),
  canonicalOrigin: DEFAULT_CANONICAL_ORIGIN,
  payTo: env("PAY_TO_ADDRESS") || env("PAY_TO"),
  payToEvm: env("PAY_TO_EVM") || env("PAY_TO_ADDRESS_EVM") || "",
  chains,
  networks: caip2Networks(chains),
  primaryChain: (chains[0] ?? "solana") as ChainKey,
  facilitatorUrl: resolveFacilitatorUrl(),
  cdpFacilitatorEnabled:
    resolveFacilitatorUrl() === CDP_FACILITATOR_URL ||
    env("USE_CDP_FACILITATOR") === "1" ||
    env("AGENTIC_CDP") === "1",
  baseRpcUrl: env("BASE_RPC_URL") || "https://mainnet.base.org",
  alchemyApiKey: env("ALCHEMY_API_KEY"),
  erc8004IdentityRegistry:
    env("ERC8004_IDENTITY_REGISTRY") || "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  erc8004ReputationRegistry:
    env("ERC8004_REPUTATION_REGISTRY") || "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  trustScoreCacheTtlSec: Number(env("TRUSTSCORE_CACHE_TTL_SEC") || "120"),
  network: (chains[0] ?? "solana") as ChainKey,
  attestationHmacSecret: resolveAttestationHmacSecret(),
  testnetMode: env("X402_TESTNET") === "1" || env("TESTNET") === "1",
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
  agentVerify: "0.04",
  mandateDiff: "0.04",
  qualityEscrowSemantic: "0.12",
  merchantCertify: "0.15",
  buyerGate: "0.03",
  pipelineTrustV2: "0.35",
  bondSlash: "0.03",
  protocolFullTrust: "0.45",
  protocolPassportIssue: "0.06",
  protocolPassportVerify: "0.02",
  protocolTrustScoreV2: "0.08",
  protocolFraudScan: "0.10",
  protocolOracleConsensus: "0.12",
  protocolExecutionIssue: "0.05",
  protocolExecutionVerify: "0.03",
  protocolReasoningCommit: "0.08",
  protocolReasoningDisclose: "0.04",
  protocolEscrowCreate: "0.08",
  protocolEscrowTransition: "0.06",
  protocolEscrowStatus: "0.02",
  protocolReplayBind: "0.02",
  protocolReplayVerify: "0.02",
  protocolZkProve: "0.15",
  protocolCreditScore: "0.06",
  protocolComplianceAssess: "0.10",
} as const;

export function assertConfig(): void {
  if (!config.payTo) {
    throw new Error(
      "Missing PAY_TO_ADDRESS. Set it in Railway/Render Variables (or .env locally) to your USDC receive wallet.",
    );
  }
  if (
    config.publicBaseUrl.includes("railway.app") &&
    !env("PUBLIC_BASE_URL") &&
    !env("CANONICAL_PUBLIC_URL")
  ) {
    console.warn(
      `[config] PUBLIC_BASE_URL not set — discovery URLs use ${config.publicBaseUrl}. Set PUBLIC_BASE_URL=${DEFAULT_CANONICAL_ORIGIN} for x402trustlayer.xyz indexing.`,
    );
  }
}
