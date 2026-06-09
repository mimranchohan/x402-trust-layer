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
  /** Downstream suite steps only — excludes this compile call (already paid). */
  steps: SuiteStep[];
  executionOrder: string[];
  suiteBaseUrl: string;
  recommendedFirstStep: string;
  planSummary: string;
  currentEndpointCostUsdc: number;
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

  let fitted = trimStepsToBudget(steps, input.maxBudgetUsdc);
  if (fitted.length === 0) {
    fitted = steps.filter((s) => s.path === "/api/guard/pre-x402").slice(0, 1);
  }
  fitted = fitted.map((s, i) => ({ ...s, step: i + 1 }));

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
      allowed: withinBudget && fitted.length > 0,
      summary: withinBudget
        ? `Compiled ${fitted.length}-step downstream plan ($${total.toFixed(2)} est.) within $${input.maxBudgetUsdc} budget`
        : `No downstream plan fits budget: $${total.toFixed(2)} est. vs $${input.maxBudgetUsdc} cap`,
      task: input.task,
      withinBudget,
      totalEstimatedUsdc: Number(total.toFixed(4)),
      maxBudgetUsdc: input.maxBudgetUsdc,
      steps: fitted,
      executionOrder: fitted.map((s) => `${s.method} ${suiteUrl(s.path)}`),
      suiteBaseUrl: suiteUrl(""),
      recommendedFirstStep,
      planSummary: fitted.map((s) => `Step ${s.step}: ${s.purpose} (${s.path}, $${s.priceUsdc})`).join("; "),
      currentEndpointCostUsdc: SUITE_PRICES.paymentCompiler,
    },
    agentTrustMeta(["plan_compiled", withinBudget ? "within_budget" : "over_budget"], {
      confidence: withinBudget ? 0.92 : 0.72,
      sources: ["payment-intent-compiler", "suite-catalog"],
      accuracy_note:
        "Downstream step costs only; this compile call ($0.15) is excluded from totalEstimatedUsdc.",
    }),
  );
}
