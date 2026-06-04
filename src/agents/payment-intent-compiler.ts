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
  recommendedFirstStep: string;
  planSummary: string;
};

function trimStepsToBudget(steps: SuiteStep[], maxBudgetUsdc: number): SuiteStep[] {
  const out = [...steps];
  const total = () => out.reduce((sum, s) => sum + s.priceUsdc, 0);
  const dropAgents = new Set(["research-brief", "external-x402", "receipt-auditor", "api-router"]);

  while (total() > maxBudgetUsdc && out.length > 2) {
    const dropIdx = out.findIndex((s) => dropAgents.has(s.agent) || s.path.includes("marketplace"));
    if (dropIdx >= 0) out.splice(dropIdx, 1);
    else out.pop();
  }

  return out.map((s, i) => ({ ...s, step: i + 1 }));
}

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

  const fitted = trimStepsToBudget(steps, input.maxBudgetUsdc);
  const total = fitted.reduce((sum, s) => sum + s.priceUsdc, 0);
  const withinBudget = total <= input.maxBudgetUsdc;
  const firstHop = fitted.find((s) => s.path.startsWith("/api/"));
  const recommendedFirstStep = firstHop
    ? `${firstHop.method} ${suiteUrl(firstHop.path)}`
    : suiteUrl("/api/guard/pre-x402");

  return withAgentTrust(
    {
      status: "ok",
      ok: true,
      allowed: withinBudget,
      summary: withinBudget
        ? `Compiled ${fitted.length}-step plan ($${total.toFixed(2)} est.) within $${input.maxBudgetUsdc} budget`
        : `Plan exceeds budget: $${total.toFixed(2)} est. vs $${input.maxBudgetUsdc} cap`,
      task: input.task,
      withinBudget,
      totalEstimatedUsdc: Number(total.toFixed(4)),
      maxBudgetUsdc: input.maxBudgetUsdc,
      steps: fitted,
      executionOrder: fitted.map((s) => `${s.method} ${suiteUrl(s.path)}`),
      suiteBaseUrl: suiteUrl(""),
      recommendedFirstStep,
      planSummary: fitted.map((s) => `Step ${s.step}: ${s.purpose} (${s.path}, $${s.priceUsdc})`).join("; "),
    },
    agentTrustMeta(["plan_compiled", withinBudget ? "within_budget" : "over_budget"], {
      confidence: withinBudget ? 0.88 : 0.72,
      sources: ["payment-intent-compiler", "suite-catalog"],
      accuracy_note: "Plan estimates suite route costs; external x402 calls are not included unless specified.",
    }),
  );
}
