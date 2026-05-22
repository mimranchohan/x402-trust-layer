import { config } from "../config.js";

export type SuiteStep = {
  step: number;
  agent: string;
  method: string;
  path: string;
  priceUsdc: number;
  purpose: string;
};

/** Buyer onboarding — only these three in README / INTEGRATE lead */
export const PRIMARY_ENTRYPOINTS = [
  {
    path: "/api/x402/proxy",
    method: "POST",
    priceUsdc: 0.08,
    label: "Default preflight (guard + probe + optional attestation)",
  },
  {
    path: "/api/guard/pre-x402",
    method: "POST",
    priceUsdc: 0.05,
    label: "Lightweight bundle (spend + identity + risk)",
  },
  {
    path: "/api/pipeline/execute",
    method: "POST",
    priceUsdc: 0.25,
    label: "Full orchestration for multi-step tasks",
  },
] as const;

/** Seller / marketplace growth */
export const KILLER_SELLER_ENDPOINTS = [
  {
    path: "/api/market/buy-advisor",
    method: "POST",
    priceUsdc: 0.08,
    label: "Rank paid APIs before you spend (Jupiter-style quote)",
  },
  {
    path: "/api/seller/audition-coach",
    method: "POST",
    priceUsdc: 0.06,
    label: "Pre-audition fix list before Dexter ingest",
  },
] as const;

export const SUITE_PRICES = {
  spendGovernor: 0.03,
  receiptAuditor: 0.05,
  riskGate: 0.08,
  apiRouter: 0.02,
  researchBrief: 0.2,
  paymentCompiler: 0.15,
  facilitatorFailover: 0.05,
  mppBroker: 0.02,
  refundArbiter: 0.08,
  budgetAllocator: 0.03,
  settlementGraph: 0.02,
  qualityMonitor: 0.03,
  identityGate: 0.05,
  evidenceLocker: 0.1,
  agentEscrow: 0.12,
  preX402Guard: 0.05,
  pipelineExecute: 0.25,
  x402Proxy: 0.08,
  mppSessionV2: 0.03,
  attestationIssue: 0.04,
  attestationVerify: 0.02,
  trustRegistry: 0.02,
  marketBuyAdvisor: 0.08,
  auditionCoach: 0.06,
} as const;

export function suiteUrl(path: string): string {
  return `${config.publicBaseUrl}${path}`;
}

export function buildDefaultPipeline(options: {
  includeResearch: boolean;
  includeRouter: boolean;
  externalCallEstimateUsdc: number;
}): SuiteStep[] {
  const steps: SuiteStep[] = [
    {
      step: 1,
      agent: "pre-x402-guard",
      method: "POST",
      path: "/api/guard/pre-x402",
      priceUsdc: SUITE_PRICES.preX402Guard,
      purpose: "Single call: spend + identity + risk before any x402 payment",
    },
  ];

  if (options.includeRouter) {
    steps.push({
      step: steps.length + 1,
      agent: "api-router",
      method: "POST",
      path: "/api/router/route",
      priceUsdc: SUITE_PRICES.apiRouter,
      purpose: "Select best marketplace API for capability",
    });
  }

  if (options.externalCallEstimateUsdc > 0) {
    steps.push({
      step: steps.length + 1,
      agent: "external-x402",
      method: "POST",
      path: "(marketplace-selected-url)",
      priceUsdc: options.externalCallEstimateUsdc,
      purpose: "Execute downstream paid API call",
    });
  }

  if (options.includeResearch) {
    steps.push({
      step: steps.length + 1,
      agent: "research-brief",
      method: "POST",
      path: "/api/research/brief",
      priceUsdc: SUITE_PRICES.researchBrief,
      purpose: "Build research pipeline and cost estimate",
    });
  }

  steps.push({
    step: steps.length + 1,
    agent: "receipt-auditor",
    method: "POST",
    path: "/api/receipt-auditor/verify",
    priceUsdc: SUITE_PRICES.receiptAuditor,
    purpose: "Verify settlement receipt on-chain",
  });

  return steps;
}
