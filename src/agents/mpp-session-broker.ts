export type MppBrokerInput = {
  action?: "estimate" | "plan";
  expectedCalls?: number;
  avgPricePerCallUsdc?: number;
  network?: string;
  objective?: string;
  topic?: string;
  sessionContext?: string;
  teamName?: string;
  durationMinutes?: number;
  constraints?: string[];
  deliverables?: string[];
};

export type MppBrokerResult = {
  status: "ok";
  action: string;
  summary: string;
  expectedCalls: number;
  avgPricePerCallUsdc: number;
  estimatedSessionCostUSDC: number;
  estimatedPerCallCostUSDC: number;
  estimatedSavingsUSDC: number;
  breakEvenCallCount: number;
  recommendation: "mpp" | "per_call";
  assumptions: string[];
};

export function runMppSessionBroker(input: MppBrokerInput): MppBrokerResult {
  const expectedCalls = input.expectedCalls ?? 25;
  const avgPricePerCallUsdc = input.avgPricePerCallUsdc ?? 0.03;
  const action = input.action ?? "estimate";

  const perCallTotal = expectedCalls * avgPricePerCallUsdc;
  const sessionOverhead = 0.01;
  const mppTotal = sessionOverhead + expectedCalls * 0.001;
  const savings = Math.max(0, perCallTotal - mppTotal);
  const breakEvenCallCount = Math.ceil(sessionOverhead / Math.max(avgPricePerCallUsdc - 0.001, 0.0001));
  const useMpp = expectedCalls >= 10 && savings > 0.05;

  return {
    status: "ok",
    action,
    summary: "Estimated MPP session cost versus per-call settlement cost.",
    expectedCalls,
    avgPricePerCallUsdc: Number(avgPricePerCallUsdc.toFixed(4)),
    estimatedSessionCostUSDC: Number(mppTotal.toFixed(4)),
    estimatedPerCallCostUSDC: Number(perCallTotal.toFixed(4)),
    estimatedSavingsUSDC: Number(savings.toFixed(4)),
    breakEvenCallCount,
    recommendation: useMpp ? "mpp" : "per_call",
    assumptions: [
      "MPP session overhead is fixed at 0.01 USDC",
      "Per-call MPP marginal cost is 0.001 USDC",
      "Per-call settlement uses provided avgPricePerCallUsdc",
      `Action mode: ${action}`,
    ],
  };
}
