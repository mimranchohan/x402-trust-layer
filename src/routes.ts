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
import { runAttestationIssue, runAttestationVerify, runTrustRegistryQuery } from "./agents/attestation-registry.js";
import { runMppSessionV2 } from "./agents/mpp-session-v2.js";
import { runPipelineExecute } from "./agents/pipeline-execute.js";
import { runPreX402Guard } from "./agents/pre-x402-guard.js";
import { runSpendGovernor } from "./agents/spend-governor.js";
import { runAuditionCoach } from "./agents/audition-coach.js";
import { runMarketBuyAdvisor } from "./agents/market-buy-advisor.js";
import { runX402Proxy } from "./agents/x402-proxy.js";
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
    { path: "POST /api/market/buy-advisor", price: `$${pricing.marketBuyAdvisor}`, tier: "killer" },
    { path: "POST /api/seller/audition-coach", price: `$${pricing.auditionCoach}`, tier: "killer" },
    { path: "POST /api/x402/proxy", price: `$${pricing.x402Proxy}`, tier: "killer" },
    { path: "POST /api/mpp/session", price: `$${pricing.mppSessionV2}`, tier: "killer" },
    { path: "POST /api/attestation/issue", price: `$${pricing.attestationIssue}`, tier: "killer" },
    { path: "POST /api/attestation/verify", price: `$${pricing.attestationVerify}`, tier: "killer" },
    { path: "GET /api/attestation/registry", price: `$${pricing.trustRegistry}`, tier: "killer" },
    { path: "POST /api/guard/pre-x402", price: `$${pricing.preX402Guard}`, tier: "bundle" },
    { path: "POST /api/pipeline/execute", price: `$${pricing.pipelineExecute}`, tier: "bundle" },
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

type PaidFn = (amount: string, description: string) => PaidMw;

const guardBodySchema = z.object({
  agentId: z.string().min(1),
  walletAddress: z.string().min(16),
  targetUrl: z.string().url(),
  estimatedCostUsdc: z.number().nonnegative(),
  network: z.string().optional(),
  policy: policySchema,
  maxTierSpendUsdc: z.number().optional(),
});

export function registerRoutes(app: Express, paid: PaidFn, asyncRoute: AsyncRoute) {
  app.post(
    "/api/guard/pre-x402",
    paid(
      pricing.preX402Guard,
      "Pre-x402 safety bundle: spend policy + wallet identity + URL risk probe in one call",
    ),
    asyncRoute(async (req, res) => {
      const parsed = guardBodySchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runPreX402Guard(parsed.data));
    }),
  );

  app.post(
    "/api/pipeline/execute",
    paid(
      pricing.pipelineExecute,
      "One-shot agent pipeline: guard, optional NL plan, facilitator routing, marketplace pick",
    ),
    asyncRoute(async (req, res) => {
      const parsed = guardBodySchema
        .extend({
          task: z.string().min(3).optional(),
          maxBudgetUsdc: z.number().positive().optional(),
          marketplaceQuery: z.string().min(2).optional(),
          preferNetwork: z.string().optional(),
          maxPriceUsdc: z.number().optional(),
          includePlan: z.boolean().optional(),
          includeRouter: z.boolean().optional(),
          includeFailover: z.boolean().optional(),
          settlement: z
            .object({
              transactionHash: z.string().optional(),
              network: z.string().min(1),
              expectedAmountUsdc: z.number().optional(),
              payTo: z.string().optional(),
              payer: z.string().optional(),
              amountUsdc: z.number().optional(),
            })
            .optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runPipelineExecute(parsed.data));
    }),
  );

  app.post(
    "/api/x402/proxy",
    paid(
      pricing.x402Proxy,
      "All-in-one x402 proxy: guard + security grade + attestation + downstream probe in one payment",
    ),
    asyncRoute(async (req, res) => {
      const parsed = guardBodySchema
        .extend({
          downstreamMethod: z.enum(["GET", "POST"]).optional(),
          downstreamBody: z.record(z.unknown()).optional(),
          issueAttestation: z.boolean().optional(),
          preferredChain: z.enum(["solana", "base", "polygon"]).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runX402Proxy(parsed.data));
    }),
  );

  app.post(
    "/api/mpp/session",
    paid(
      pricing.mppSessionV2,
      "MPP session lifecycle: open, voucher, close — batch settlement savings on Solana/Base",
    ),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          action: z.enum(["open", "voucher", "close", "status"]),
          sessionId: z.string().optional(),
          expectedCalls: z.number().int().positive().optional(),
          avgPricePerCallUsdc: z.number().positive().optional(),
          chain: z.enum(["solana", "base", "polygon"]).optional(),
          maxBudgetUsdc: z.number().positive().optional(),
          agentId: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runMppSessionV2(parsed.data));
    }),
  );

  app.post(
    "/api/attestation/issue",
    paid(pricing.attestationIssue, "Issue signed preflight attestation for partner agent trust networks"),
    asyncRoute(async (req, res) => {
      const parsed = guardBodySchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runAttestationIssue(parsed.data));
    }),
  );

  app.post(
    "/api/attestation/verify",
    paid(pricing.attestationVerify, "Verify attestation signature and expiry before downstream payment"),
    asyncRoute(async (req, res) => {
      const parsed = z.object({ attestationId: z.string().min(8) }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runAttestationVerify(parsed.data.attestationId));
    }),
  );

  app.get(
    "/api/attestation/registry",
    paid(pricing.trustRegistry, "Query trust registry of valid attestations for agent fleets"),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          minGrade: z.string().optional(),
          agentId: z.string().optional(),
          limit: z.coerce.number().optional(),
        })
        .safeParse(req.query);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runTrustRegistryQuery(parsed.data));
    }),
  );

  app.post(
    "/api/payment-intent/compile",
    paid(pricing.paymentCompiler, "Compile multi-step x402 agent execution plans from natural language tasks"),
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
    paid(pricing.facilitatorFailover, "Rank x402 facilitators and recommend healthy failover routing"),
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
    paid(pricing.mppBroker, "Estimate Solana MPP session savings versus per-call settlement"),
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
    paid(pricing.spendGovernor, "Enforce per-call and daily USDC spend policies for AI agents"),
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
    paid(pricing.identityGate, "Wallet identity tier and risk scoring before paid API calls"),
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
    paid(pricing.riskGate, "Probe x402 endpoint safety and return risk score before payment"),
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
    "/api/market/buy-advisor",
    paid(
      pricing.marketBuyAdvisor,
      "x402 buy intelligence: rank marketplace APIs, policy preflight, chain and MPP advice before payment",
    ),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          intent: z.string().min(2),
          targetUrl: z.string().url().optional(),
          agentId: z.string().min(1).optional(),
          walletAddress: z.string().min(16).optional(),
          policy: policySchema.optional(),
          preferNetwork: z.string().optional(),
          maxPriceUsdc: z.number().positive().optional(),
          expectedCalls: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(10).optional(),
          dryRunTarget: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runMarketBuyAdvisor(parsed.data));
    }),
  );

  app.post(
    "/api/seller/audition-coach",
    paid(
      pricing.auditionCoach,
      "Seller audition coach: audit OpenAPI, well-known x402, and unpaid 402 probes with fix instructions",
    ),
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          origin: z.string().url(),
          maxRoutes: z.number().int().min(1).max(30).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runAuditionCoach(parsed.data));
    }),
  );

  app.post(
    "/api/router/route",
    paid(pricing.apiRouter, "Select the best verified x402 marketplace API for a capability query"),
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
    paid(pricing.researchBrief, "Build a paid-API research pipeline and cost estimate for any topic"),
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
    paid(pricing.receiptAuditor, "Verify x402 settlement receipts and on-chain transaction alignment"),
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
    paid(pricing.refundArbiter, "Evaluate buyer refund eligibility from verification signals"),
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
    paid(pricing.budgetAllocator, "Allocate shared USDC budget across a fleet of agents by priority"),
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
    paid(pricing.settlementGraph, "Recommend next paid APIs after a settlement receipt"),
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
    paid(pricing.qualityMonitor, "Regression probe x402 endpoints and return quality scores"),
    asyncRoute(async (req, res) => {
      const parsed = z.object({ urls: z.array(z.string().url()).min(1).max(10) }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runQualityMonitor(parsed.data));
    }),
  );

  app.post(
    "/api/evidence-locker/export",
    paid(pricing.evidenceLocker, "Export tamper-evident compliance bundles for x402 settlements"),
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
    paid(pricing.agentEscrow, "Create and manage agent-to-agent USDC escrow records"),
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
      primaryEntrypoints: [
        "POST /api/x402/proxy — killer all-in-one preflight ($0.08)",
        "POST /api/guard/pre-x402 — lightweight guard ($0.05)",
        "POST /api/mpp/session — MPP batch savings ($0.03)",
        "POST /api/attestation/issue — trust registry ($0.04)",
        "POST /api/pipeline/execute — full orchestration ($0.25)",
      ],
      recommendedOrder: [
        "POST /api/pipeline/execute (or guard + steps below)",
        "POST /api/payment-intent/compile",
        "POST /api/guard/pre-x402",
        "POST /api/facilitator/failover",
        "POST /api/router/route",
        "(downstream x402 call)",
        "POST /api/receipt-auditor/verify",
        "POST /api/settlement-graph/next",
        "POST /api/refund-arbiter/evaluate",
      ],
      estimatedSuiteOnlyUsdc: Object.values(SUITE_PRICES).reduce((a, b) => a + b, 0).toFixed(2),
      bundleSavingsNote: "pre-x402 guard replaces 3 calls ($0.16 → $0.05); pipeline/execute replaces guard+plan+failover+router ($0.27+ → $0.25)",
    });
  });
}
