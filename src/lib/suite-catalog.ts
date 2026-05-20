import { config } from "../config.js";

export type SuiteStep = {
  step: number;
  agent: string;
  method: string;
  path: string;
  priceUsdc: number;
  purpose: string;
};

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
      agent: "spend-governor",
      method: "POST",
      path: "/api/spend-governor/check",
      priceUsdc: SUITE_PRICES.spendGovernor,
      purpose: "Enforce daily and per-call budget before spending",
    },
    {
      step: 2,
      agent: "identity-gate",
      method: "POST",
      path: "/api/identity-gate/check",
      priceUsdc: SUITE_PRICES.identityGate,
      purpose: "Validate payer wallet risk tier",
    },
    {
      step: 3,
      agent: "risk-gate",
      method: "POST",
      path: "/api/risk-gate/scan",
      priceUsdc: SUITE_PRICES.riskGate,
      purpose: "Probe target paid API safety",
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
