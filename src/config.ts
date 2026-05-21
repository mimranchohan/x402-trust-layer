import dotenv from "dotenv";

import { parseChainList, caip2Networks, type ChainKey } from "./lib/chains.js";



dotenv.config();



function resolvePublicBaseUrl(port: number): string {

  const raw = (process.env.PUBLIC_BASE_URL ?? "").trim();

  if (raw) return raw.replace(/\/$/, "");

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {

    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;

  }

  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");

  return `http://127.0.0.1:${port}`;

}



function env(name: string): string {

  return (process.env[name] ?? "").trim();

}



const chains = parseChainList(env("NETWORKS") || env("NETWORK") || "solana,base");



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

  /** Legacy single-network field */

  network: (chains[0] ?? "solana") as ChainKey,

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

} as const;



export function assertConfig(): void {

  if (!config.payTo) {

    throw new Error(

      "Missing PAY_TO_ADDRESS. Set it in Railway/Render Variables (or .env locally) to your USDC receive wallet.",

    );

  }

}


