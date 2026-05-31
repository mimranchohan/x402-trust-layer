import { buildDefaultPipeline, suiteUrl, SUITE_PRICES, type SuiteStep } from "../lib/suite-catalog.js";
import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";

export type CompilerInput = {
  task: string;
  maxBudgetUsdc: number;
  agentId: string;
  includeResearch?: boolean;
  externalCallEstimateUsdc?: number;
};

export type CompilerResult = {
  status: "ok";
  ok: true;
  task: string;
  withinBudget: boolean;
  totalEstimatedUsdc: number;
  maxBudgetUsdc: number;
  steps: SuiteStep[];
  executionOrder: string[];
  suiteBaseUrl: string;
};

export function runPaymentIntentCompiler(input: CompilerInput): WithAgentTrust<CompilerResult> {
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
  const withinBudget = total <= input.maxBudgetUsdc;

  return withAgentTrust(
    {
      status: "ok",
      ok: true,
      allowed: withinBudget,
      summary: withinBudget
        ? `Compiled ${steps.length}-step plan ($${total.toFixed(2)} est.) within $${input.maxBudgetUsdc} budget`
        : `Plan exceeds budget: $${total.toFixed(2)} est. vs $${input.maxBudgetUsdc} cap`,
      task: input.task,
      withinBudget,
      totalEstimatedUsdc: Number(total.toFixed(4)),
      maxBudgetUsdc: input.maxBudgetUsdc,
      steps,
      executionOrder: steps.map((s) => `${s.method} ${suiteUrl(s.path)}`),
      suiteBaseUrl: suiteUrl(""),
    },
    agentTrustMeta(["plan_compiled", withinBudget ? "within_budget" : "over_budget"], {
      confidence: withinBudget ? 0.88 : 0.72,
      sources: ["payment-intent-compiler", "suite-catalog"],
      accuracy_note: "Plan estimates suite route costs; external x402 calls are not included unless specified.",
    }),
  );
}
