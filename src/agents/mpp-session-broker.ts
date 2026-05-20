export type MppBrokerInput = {
  action: "estimate" | "plan";
  expectedCalls: number;
  avgPricePerCallUsdc: number;
  network?: string;
};

export type MppBrokerResult = {
  action: string;
  expectedCalls: number;
  perCallModeCostUsdc: number;
  mppSessionEstimateCostUsdc: number;
  estimatedSavingsUsdc: number;
  recommendation: "mpp" | "per_call";
  plan: string[];
  docsUrl: string;
};

export function runMppSessionBroker(input: MppBrokerInput): MppBrokerResult {
  const perCallTotal = input.expectedCalls * input.avgPricePerCallUsdc;
  const sessionOverhead = 0.01;
  const mppTotal = sessionOverhead + input.expectedCalls * 0.001;
  const savings = Math.max(0, perCallTotal - mppTotal);
  const useMpp = input.expectedCalls >= 10 && savings > 0.05;

  return {
    action: input.action,
    expectedCalls: input.expectedCalls,
    perCallModeCostUsdc: Number(perCallTotal.toFixed(4)),
    mppSessionEstimateCostUsdc: Number(mppTotal.toFixed(4)),
    estimatedSavingsUsdc: Number(savings.toFixed(4)),
    recommendation: useMpp ? "mpp" : "per_call",
    plan: [
      "Open an MPP session channel on Solana via Dexter facilitator",
      "Issue vouchers per API call without per-call on-chain settlement",
      "Close session to settle aggregate USDC once",
      "Use Spend Governor to cap total session budget",
    ],
    docsUrl: "https://docs.dexter.cash/docs/mpp/",
  };
}
