import { buildDefaultPipeline, suiteUrl, SUITE_PRICES, type SuiteStep } from "../lib/suite-catalog.js";

export type CompilerInput = {
  task: string;
  maxBudgetUsdc: number;
  agentId: string;
  includeResearch?: boolean;
  externalCallEstimateUsdc?: number;
};

export type CompilerResult = {
  task: string;
  withinBudget: boolean;
  totalEstimatedUsdc: number;
  maxBudgetUsdc: number;
  steps: SuiteStep[];
  executionOrder: string[];
  suiteBaseUrl: string;
};

export function runPaymentIntentCompiler(input: CompilerInput): CompilerResult {
  const taskLower = input.task.toLowerCase();
  const includeResearch =
    input.includeResearch ?? /research|report|brief|analyze|analysis/.test(taskLower);
  const includeRouter =
    /price|oracle|api|data|fetch|market|token|defi/.test(taskLower) || !includeResearch;

  const externalEstimate = input.externalCallEstimateUsdc ?? (includeRouter ? 0.05 : 0);

  const steps = buildDefaultPipeline({
    includeResearch,
    includeRouter,
    externalCallEstimateUsdc: externalEstimate,
  });

  steps.unshift({
    step: 1,
    agent: "payment-intent-compiler",
    method: "POST",
    path: "/api/payment-intent/compile",
    priceUsdc: SUITE_PRICES.paymentCompiler,
    purpose: "Compile multi-step x402 execution plan",
  });
  steps.forEach((s, i) => {
    s.step = i + 1;
  });

  const total = steps.reduce((sum, s) => sum + s.priceUsdc, 0);

  return {
    task: input.task,
    withinBudget: total <= input.maxBudgetUsdc,
    totalEstimatedUsdc: Number(total.toFixed(4)),
    maxBudgetUsdc: input.maxBudgetUsdc,
    steps,
    executionOrder: steps.map((s) => `${s.method} ${suiteUrl(s.path)}`),
    suiteBaseUrl: suiteUrl(""),
  };
}
