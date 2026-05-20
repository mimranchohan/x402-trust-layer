import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { runAgentEscrow } from "./agents/agent-escrow.js";
import { runApiRouter } from "./agents/api-router.js";
import { runBudgetAllocator } from "./agents/budget-allocator.js";
import { runEvidenceLocker } from "./agents/evidence-locker.js";
import { runFacilitatorFailover } from "./agents/facilitator-failover.js";
import { runIdentityGate } from "./agents/identity-gate.js";
import { runMppSessionBroker } from "./agents/mpp-session-broker.js";
import { runPaymentIntentCompiler } from "./agents/payment-intent-compiler.js";
import { runQualityMonitor } from "./agents/quality-monitor.js";
import { runReceiptAuditor } from "./agents/receipt-auditor.js";
import { runRefundArbiter } from "./agents/refund-arbiter.js";
import { runResearchBrief } from "./agents/research-brief.js";
import { runRiskGate } from "./agents/risk-gate.js";
import { runSettlementGraph } from "./agents/settlement-graph.js";
import { runSpendGovernor } from "./agents/spend-governor.js";
import { pricing } from "./config.js";
import { SUITE_PRICES } from "./lib/suite-catalog.js";

type PaidMw = ReturnType<typeof import("@dexterai/x402/server").x402Middleware>;
type AsyncRoute = (
  handler: (req: Request, res: Response) => Promise<void>,
) => (req: Request, res: Response, next: NextFunction) => void;

const policySchema = z.object({
  dailyCapUsdc: z.number().positive(),
  perCallCapUsdc: z.number().positive(),
  allowedHosts: z.array(z.string()).optional(),
  blockedHosts: z.array(z.string()).optional(),
  allowedNetworks: z.array(z.string()).optional(),
});

export function listEndpoints() {
  return [
    { path: "POST /api/payment-intent/compile", price: `$${pricing.paymentCompiler}`, tier: "orchestration" },
    { path: "POST /api/facilitator/failover", price: `$${pricing.facilitatorFailover}`, tier: "orchestration" },
    { path: "POST /api/mpp/session-plan", price: `$${pricing.mppBroker}`, tier: "orchestration" },
    { path: "POST /api/spend-governor/check", price: `$${pricing.spendGovernor}`, tier: "core" },
    { path: "POST /api/identity-gate/check", price: `$${pricing.identityGate}`, tier: "core" },
    { path: "POST /api/risk-gate/scan", price: `$${pricing.riskGate}`, tier: "core" },
    { path: "POST /api/router/route", price: `$${pricing.apiRouter}`, tier: "core" },
    { path: "POST /api/research/brief", price: `$${pricing.researchBrief}`, tier: "core" },
    { path: "POST /api/receipt-auditor/verify", price: `$${pricing.receiptAuditor}`, tier: "core" },
    { path: "POST /api/refund-arbiter/evaluate", price: `$${pricing.refundArbiter}`, tier: "trust" },
    { path: "POST /api/budget-allocator/run", price: `$${pricing.budgetAllocator}`, tier: "enterprise" },
    { path: "POST /api/settlement-graph/next", price: `$${pricing.settlementGraph}`, tier: "intelligence" },
    { path: "POST /api/quality-monitor/probe", price: `$${pricing.qualityMonitor}`, tier: "intelligence" },
    { path: "POST /api/evidence-locker/export", price: `$${pricing.evidenceLocker}`, tier: "enterprise" },
    { path: "POST /api/agent-escrow", price: `$${pricing.agentEscrow}`, tier: "enterprise" },
  ];
}

export function registerRoutes(app: Express, paid: (amount: string) => PaidMw, asyncRoute: AsyncRoute) {
  app.post(
    "/api/payment-intent/compile",
    paid(pricing.paymentCompiler),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          task: z.string().min(3),
          maxBudgetUsdc: z.number().positive(),
          agentId: z.string().min(1),
          includeResearch: z.boolean().optional(),
          externalCallEstimateUsdc: z.number().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runPaymentIntentCompiler(parsed.data));
    }),
  );

  app.post(
    "/api/facilitator/failover",
    paid(pricing.facilitatorFailover),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          targetUrl: z.string().url(),
          preferNetwork: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runFacilitatorFailover(parsed.data));
    }),
  );

  app.post(
    "/api/mpp/session-plan",
    paid(pricing.mppBroker),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          action: z.enum(["estimate", "plan"]).default("estimate"),
          expectedCalls: z.number().int().positive(),
          avgPricePerCallUsdc: z.number().positive(),
          network: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runMppSessionBroker(parsed.data));
    }),
  );

  app.post(
    "/api/spend-governor/check",
    paid(pricing.spendGovernor),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          agentId: z.string().min(1),
          estimatedCostUsdc: z.number().nonnegative(),
          targetUrl: z.string().url().optional(),
          network: z.string().optional(),
          policy: policySchema,
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runSpendGovernor(parsed.data));
    }),
  );

  app.post(
    "/api/identity-gate/check",
    paid(pricing.identityGate),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          walletAddress: z.string().min(16),
          maxTierSpendUsdc: z.number().optional(),
          requireMainnet: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runIdentityGate(parsed.data));
    }),
  );

  app.post(
    "/api/risk-gate/scan",
    paid(pricing.riskGate),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          targetUrl: z.string().url(),
          estimatedCostUsdc: z.number().optional(),
          policy: z
            .object({
              perCallCapUsdc: z.number().optional(),
              blockedHosts: z.array(z.string()).optional(),
            })
            .optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runRiskGate(parsed.data));
    }),
  );

  app.post(
    "/api/router/route",
    paid(pricing.apiRouter),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          query: z.string().min(2),
          preferNetwork: z.string().optional(),
          maxPriceUsdc: z.number().optional(),
          execute: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runApiRouter(parsed.data));
    }),
  );

  app.post(
    "/api/research/brief",
    paid(pricing.researchBrief),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          topic: z.string().min(2),
          includePrice: z.boolean().optional(),
          language: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runResearchBrief(parsed.data));
    }),
  );

  app.post(
    "/api/receipt-auditor/verify",
    paid(pricing.receiptAuditor),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          transactionHash: z.string().optional(),
          network: z.string().min(1),
          expectedAmountUsdc: z.number().optional(),
          payTo: z.string().optional(),
          settlement: z
            .object({
              transaction: z.string().optional(),
              payer: z.string().optional(),
              amountUsdc: z.number().optional(),
              network: z.string().optional(),
            })
            .optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runReceiptAuditor(parsed.data));
    }),
  );

  app.post(
    "/api/refund-arbiter/evaluate",
    paid(pricing.refundArbiter),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          verificationScore: z.number().min(0).max(100).optional(),
          responseEmpty: z.boolean().optional(),
          responseGeneric: z.boolean().optional(),
          expectedAmountUsdc: z.number().optional(),
          actualAmountUsdc: z.number().optional(),
          endpointReachable: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runRefundArbiter(parsed.data));
    }),
  );

  app.post(
    "/api/budget-allocator/run",
    paid(pricing.budgetAllocator),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          fleetId: z.string().min(1),
          poolRemainingUsdc: z.number().nonnegative(),
          agents: z.array(
            z.object({
              agentId: z.string(),
              priority: z.number(),
              requestedUsdc: z.number().nonnegative(),
              dailyRemainingUsdc: z.number().nonnegative(),
            }),
          ),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runBudgetAllocator(parsed.data));
    }),
  );

  app.post(
    "/api/settlement-graph/next",
    paid(pricing.settlementGraph),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          lastEndpointPath: z.string().optional(),
          lastTopic: z.string().optional(),
          maxRecommendations: z.number().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runSettlementGraph(parsed.data));
    }),
  );

  app.post(
    "/api/quality-monitor/probe",
    paid(pricing.qualityMonitor),
    asyncRoute(async (req, res) => {
      const parsed = z.object({ urls: z.array(z.string().url()).min(1).max(10) }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runQualityMonitor(parsed.data));
    }),
  );

  app.post(
    "/api/evidence-locker/export",
    paid(pricing.evidenceLocker),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          organizationId: z.string().min(1),
          records: z.array(
            z.object({
              transactionHash: z.string().optional(),
              endpoint: z.string(),
              amountUsdc: z.number(),
              payer: z.string().optional(),
              network: z.string(),
              timestamp: z.string().optional(),
            }),
          ),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runEvidenceLocker(parsed.data));
    }),
  );

  app.post(
    "/api/agent-escrow",
    paid(pricing.agentEscrow),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          action: z.enum(["create", "status", "release"]),
          payerAgentId: z.string().optional(),
          payeeAgentId: z.string().optional(),
          amountUsdc: z.number().positive().optional(),
          releaseCondition: z.string().optional(),
          escrowId: z.string().optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const b = parsed.data;
      if (b.action === "create") {
        if (!b.payerAgentId || !b.payeeAgentId || !b.amountUsdc || !b.releaseCondition) {
          res.status(400).json({ error: "create requires payerAgentId, payeeAgentId, amountUsdc, releaseCondition" });
          return;
        }
        res.json(
          await runAgentEscrow({
            action: "create",
            payerAgentId: b.payerAgentId,
            payeeAgentId: b.payeeAgentId,
            amountUsdc: b.amountUsdc,
            releaseCondition: b.releaseCondition,
            metadata: b.metadata,
          }),
        );
        return;
      }
      if (!b.escrowId) {
        res.status(400).json({ error: "status/release requires escrowId" });
        return;
      }
      res.json(await runAgentEscrow({ action: b.action, escrowId: b.escrowId }));
    }),
  );

  app.get("/api/pipeline/full", (_req, res) => {
    res.json({
      name: "x402 Agent Suite Pro — Full Pipeline",
      recommendedOrder: [
        "POST /api/payment-intent/compile",
        "POST /api/spend-governor/check",
        "POST /api/identity-gate/check",
        "POST /api/risk-gate/scan",
        "POST /api/facilitator/failover",
        "POST /api/router/route",
        "(downstream x402 call)",
        "POST /api/receipt-auditor/verify",
        "POST /api/settlement-graph/next",
        "POST /api/refund-arbiter/evaluate",
      ],
      estimatedSuiteOnlyUsdc: Object.values(SUITE_PRICES).reduce((a, b) => a + b, 0).toFixed(2),
    });
  });
}
