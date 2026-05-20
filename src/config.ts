import dotenv from "dotenv";

dotenv.config();

function resolvePublicBaseUrl(port: number): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  return `http://127.0.0.1:${port}`;
}

export const config = {
  port: Number(process.env.PORT ?? 3402),
  publicBaseUrl: resolvePublicBaseUrl(Number(process.env.PORT ?? 3402)),
  payTo: process.env.PAY_TO_ADDRESS ?? "",
  network: (process.env.NETWORK ?? "base") as "base" | "solana",
  facilitatorUrl: process.env.FACILITATOR_URL ?? "https://x402.dexter.cash",
  baseRpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
};

export const pricing = {
  paymentCompiler: "0.15",
  facilitatorFailover: "0.05",
  mppBroker: "0.02",
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
} as const;

export function assertConfig(): void {
  if (!config.payTo) {
    throw new Error("Set PAY_TO_ADDRESS in .env before starting the server.");
  }
}
