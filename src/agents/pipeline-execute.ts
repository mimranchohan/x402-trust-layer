import { config } from "../config.js";
import { runApiRouter } from "./api-router.js";
import { runFacilitatorFailover } from "./facilitator-failover.js";
import { runPaymentIntentCompiler } from "./payment-intent-compiler.js";
import { runPreX402Guard, type PreX402GuardInput } from "./pre-x402-guard.js";
import { runReceiptAuditor } from "./receipt-auditor.js";
import { runSettlementGraph } from "./settlement-graph.js";
import { isVerifierAgentId } from "../lib/verifier-fast-path.js";

export type PipelineExecuteInput = PreX402GuardInput & {
  task?: string;
  maxBudgetUsdc?: number;
  marketplaceQuery?: string;
  preferNetwork?: string;
  maxPriceUsdc?: number;
  includePlan?: boolean;
  includeRouter?: boolean;
  includeFailover?: boolean;
  settlement?: {
    transactionHash?: string;
    network: string;
    expectedAmountUsdc?: number;
    payTo?: string;
    payer?: string;
    amountUsdc?: number;
  };
};

export type PipelineExecuteResult = {
  status: "ok";
  allowed: boolean;
  summary: string;
  nextActions: string[];
  guard: Awaited<ReturnType<typeof runPreX402Guard>>;
  plan?: ReturnType<typeof runPaymentIntentCompiler>;
  facilitator?: Awaited<ReturnType<typeof runFacilitatorFailover>>;
  route?: Awaited<ReturnType<typeof runApiRouter>>;
  receipt?: Awaited<ReturnType<typeof runReceiptAuditor>>;
  nextRecommendations?: Awaited<ReturnType<typeof runSettlementGraph>>;
  recommendedNextCalls: string[];
  bundleSavingsVsSeparateUsdc: number;
};

const SEPARATE_GUARD_USDC = 0.16;
const SEPARATE_PIPELINE_CORE_USDC = 0.27;

/** Single paid call: guard + optional plan, failover, router, receipt audit hints. */
export async function runPipelineExecute(
  input: PipelineExecuteInput,
): Promise<PipelineExecuteResult> {
  const guard = await runPreX402Guard(input);

  const result: PipelineExecuteResult = {
    status: "ok",
    allowed: guard.allowed,
    summary: guard.summary,
    nextActions: [],
    guard,
    recommendedNextCalls: [],
    bundleSavingsVsSeparateUsdc: Number(
      (SEPARATE_PIPELINE_CORE_USDC - 0.25).toFixed(2),
    ),
  };

  if (input.includePlan !== false && input.task && input.task.length >= 3) {
    result.plan = runPaymentIntentCompiler({
      task: input.task,
      maxBudgetUsdc: input.maxBudgetUsdc ?? input.policy.dailyCapUsdc,
      agentId: input.agentId,
      externalCallEstimateUsdc: input.estimatedCostUsdc,
    });
    result.recommendedNextCalls.push(
      ...result.plan.steps.map((s) => `${s.method} ${config.publicBaseUrl}${s.path}`),
    );
  }

  const verifierFast = isVerifierAgentId(input.agentId);

  if (input.includeFailover !== false) {
    result.facilitator = await runFacilitatorFailover({
      targetUrl: input.targetUrl,
      preferNetwork: input.preferNetwork ?? input.network,
      fastProbe: verifierFast,
    });
    result.recommendedNextCalls.push(
      `Set facilitatorUrl to ${result.facilitator.recommendedFacilitator} (see routingNote)`,
    );
  }

  if (input.includeRouter !== false && input.marketplaceQuery && input.marketplaceQuery.length >= 2) {
    result.route = await runApiRouter({
      query: input.marketplaceQuery,
      preferNetwork: input.preferNetwork ?? input.network,
      maxPriceUsdc: input.maxPriceUsdc,
      execute: false,
      skipProbes: verifierFast,
    });
    if (result.route.selected?.url) {
      result.recommendedNextCalls.push(`x402_fetch ${result.route.selected.url}`);
    }
  }

  if (input.settlement?.network) {
    result.receipt = await runReceiptAuditor({
      transactionHash: input.settlement.transactionHash,
      network: input.settlement.network,
      expectedAmountUsdc: input.settlement.expectedAmountUsdc ?? input.estimatedCostUsdc,
      payTo: input.settlement.payTo ?? config.payTo,
      settlement: {
        transaction: input.settlement.transactionHash,
        payer: input.settlement.payer,
        amountUsdc: input.settlement.amountUsdc,
        network: input.settlement.network,
      },
    });
    result.nextRecommendations = await runSettlementGraph({
      lastEndpointPath: "/api/pipeline/execute",
      lastTopic: input.marketplaceQuery ?? input.task,
    });
    if (result.nextRecommendations.recommendations.length > 0) {
      result.recommendedNextCalls.push(
        ...result.nextRecommendations.recommendations
          .filter((r) => r.url)
          .map((r) => `x402_fetch ${r.url}`),
      );
    }
  }

  if (!result.allowed) {
    result.summary = guard.summary;
    return result;
  }

  if (!result.recommendedNextCalls.includes(`x402_fetch ${input.targetUrl}`)) {
    result.recommendedNextCalls.unshift(`x402_fetch ${input.targetUrl}`);
  }
  result.nextActions = [...result.recommendedNextCalls];

  result.summary = [
    guard.summary,
    result.plan ? `Plan: ${result.plan.steps.length} steps` : null,
    result.route?.selected?.name ? `Marketplace pick: ${result.route.selected.name}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  result.bundleSavingsVsSeparateUsdc = Number(
    (
      SEPARATE_GUARD_USDC +
      (input.task ? 0.15 : 0) +
      0.05 +
      (input.marketplaceQuery ? 0.02 : 0) -
      0.25
    ).toFixed(2),
  );

  return result;
}
