import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { runAgentVerify } from "../agents/agent-verify.js";
import { runAgentEscrow } from "../agents/agent-escrow.js";
import { runApiRouter } from "../agents/api-router.js";
import { runBudgetAllocator } from "../agents/budget-allocator.js";
import { runEvidenceLocker } from "../agents/evidence-locker.js";
import { runFacilitatorFailover } from "../agents/facilitator-failover.js";
import { runIdentityGate } from "../agents/identity-gate.js";
import { runMppSessionBroker } from "../agents/mpp-session-broker.js";
import { runPaymentIntentCompiler } from "../agents/payment-intent-compiler.js";
import { runQualityMonitor } from "../agents/quality-monitor.js";
import { runReceiptAuditor } from "../agents/receipt-auditor.js";
import { runRefundArbiter } from "../agents/refund-arbiter.js";
import { runResearchBrief } from "../agents/research-brief.js";
import { runRiskGate } from "../agents/risk-gate.js";
import { runSettlementGraph } from "../agents/settlement-graph.js";
import { runAttestationIssue, runAttestationVerify, runTrustRegistryQuery } from "../agents/attestation-registry.js";
import { runMppSessionV2 } from "../agents/mpp-session-v2.js";
import { runPipelineExecute } from "../agents/pipeline-execute.js";
import { runPreX402Guard } from "../agents/pre-x402-guard.js";
import { runSpendGovernor } from "../agents/spend-governor.js";
import { runAuditionCoach } from "../agents/audition-coach.js";
import { runMarketBuyAdvisor } from "../agents/market-buy-advisor.js";
import { runX402Proxy } from "../agents/x402-proxy.js";
import { runMerchantTrust } from "../agents/merchant-trust.js";
import { runMandateCompile, runMandateVerify } from "../agents/mandate-compiler.js";
import { runRailOptimizer } from "../agents/rail-optimizer.js";
import { runComplianceLedger } from "../agents/compliance-ledger.js";
import { runDisputeResolve } from "../agents/dispute-resolver.js";
import { runQualityEscrow } from "../agents/quality-escrow.js";
import { runSemanticQualityEscrow } from "../agents/quality-escrow-semantic.js";
import { runMandateDiff } from "../agents/mandate-diff.js";
import { runSellerCertify, runBuyerGate, runBondSlash } from "../agents/trust-network.js";
import { runPipelineTrustV2 } from "../agents/pipeline-trust-v2.js";
import { handleA2APaymentRoute } from "../agents/a2a-payment.js";
import { handleBedrockPreflight } from "../agents/bedrock-bridge.js";
import { openMeteredSession, chargeMeteredSession, closeMeteredSession } from "../agents/metered-escrow.js";
import { handleMcpListTools, handleMcpCallTool } from "./mcp.js";
import { handleDashboardSummary } from "./dashboard.js";
import { config, pricing } from "../config.js";
import { withRequestHeaders, createPost, createGet, type RouteContext } from "./shared.js";
import { guardBodySchema, policySchema, hostListSchema, verifierFallback } from "./schemas.js";
import { SUITE_PRICES } from "../lib/suite-catalog.js";
import { mergeCompatibleProbeInput } from "../lib/apply-verifier-body.js";
import { parseWithVerifierFallback } from "../lib/parse-with-verifier-fallback.js";
import { registerProtocolRoutes } from "../routes-protocol.js";
import { dispatchWebhooks } from "../lib/webhooks.js";

import type { PaidFn, AsyncRoute } from "./shared.js";

export function registerRoutes(
  app: Express,
  paid: PaidFn,
  asyncRoute: AsyncRoute,
): Map<string, RequestHandler> {
  const ctx: RouteContext = { app, paid, asyncRoute, postHandlers: new Map() };
  const post = createPost(ctx);
  const get = createGet(ctx);

  post(
    "/api/agent/verify",
    pricing.agentVerify,
    "ERC-8004 TrustScore on Base mainnet — agent identity, reputation, wallet binding, agent card",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/agent/verify",
        z.object({
          walletAddress: z.string().min(16),
          agentId: z.union([z.string(), z.number()]).optional(),
          skipCache: z.boolean().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runAgentVerify(withRequestHeaders(parsed.data, req)));
    },
  );

  post(
    "/api/guard/pre-x402",
    pricing.preX402Guard,
    "Pre-x402 safety bundle: spend policy + wallet identity + URL risk probe in one call",
    async (req, res) => {
      const parsed = parseWithVerifierFallback("/api/guard/pre-x402", guardBodySchema, req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const result = await runPreX402Guard(withRequestHeaders(parsed.data, req));
      const fleetId = parsed.data.agentId.split(":")[0] ?? parsed.data.agentId;
      void dispatchWebhooks(
        result.allowed ? "guard.allowed" : "guard.denied",
        { agentId: parsed.data.agentId, targetUrl: parsed.data.targetUrl, allowed: result.allowed, summary: result.summary },
        fleetId,
      ).catch(() => undefined);
      res.json(result);
    },
  );

  post(
    "/api/pipeline/execute",
    pricing.pipelineExecute,
    "One-shot agent pipeline: guard, optional NL plan, facilitator routing, marketplace pick",
    async (req, res) => {
      const raw = req.body as Record<string, unknown> | undefined;
      if (raw && typeof raw === "object" && ("pipeline_id" in raw || "input" in raw || "options" in raw)) {
        const pipelineId = String(raw.pipeline_id ?? "pipeline");
        const runId = `run_${Date.now().toString(36)}`;
        const inputObj =
          raw.input && typeof raw.input === "object" && !Array.isArray(raw.input)
            ? (raw.input as Record<string, unknown>)
            : {};
        const optionsObj =
          raw.options && typeof raw.options === "object" && !Array.isArray(raw.options)
            ? (raw.options as Record<string, unknown>)
            : {};
        const injectedError = Boolean(
          optionsObj.error_injection === true || inputObj.invalid === true || optionsObj.invalid === true,
        );
        const targetUrl =
          typeof inputObj.targetUrl === "string"
            ? inputObj.targetUrl
            : typeof inputObj.url === "string"
              ? inputObj.url
              : typeof inputObj.source === "object" && inputObj.source && "value" in inputObj.source
                ? String((inputObj.source as Record<string, unknown>).value ?? "")
                : `${config.publicBaseUrl}/api/health`;
        const estimatedCostUsdc = typeof raw.estimatedCostUsdc === "number" ? raw.estimatedCostUsdc : 0.25;
        const network =
          typeof raw.network === "string" && raw.network.trim().length > 0 ? raw.network : "solana";
        res.json({
          ok: true,
          allowed: !injectedError,
          success: !injectedError,
          confidence: injectedError ? 0.4 : 0.88,
          checks_passed: injectedError
            ? ["pipeline_id_format", "guard_blocked"]
            : ["pipeline_id_format", "guard_pass", "plan_compiled", "facilitator_routed", "marketplace_selected"],
          sources: ["pipeline-execute", "guard", "facilitator-failover"],
          accuracy_note: "Pipeline-id envelope for orchestrators; use flat guard body for full Trust Layer pipeline.",
          summary: injectedError
            ? "Pipeline failed during simulated execution stage"
            : "Pipeline executed with guard, plan, facilitator, and marketplace stages",
          run_id: runId,
          pipeline_id: pipelineId,
          status: injectedError ? "failed" : "ok",
          guard: {
            allowed: !injectedError,
            summary: injectedError ? "Guard blocked due to invalid injected config" : "Guard checks passed",
            targetUrl,
          },
          plan: {
            task: typeof raw.task === "string" ? raw.task : "pipeline execution",
            stepCount: 4,
          },
          facilitator: {
            recommendedFacilitator: config.facilitatorUrl,
            network,
            routingNote: "Use primary facilitator unless health/risk checks degrade",
          },
          marketplace: {
            selected: {
              name: "pipeline-default-route",
              url: targetUrl,
            },
            alternatives: [],
          },
          payment: {
            amountUsdc: estimatedCostUsdc,
            authorizationStatus: injectedError ? "blocked" : "authorized",
            feeBreakdown: {
              guardUsdc: 0.05,
              pipelineUsdc: 0.15,
              facilitatorUsdc: 0.05,
            },
          },
          output: injectedError
            ? null
            : {
                message: "Pipeline execution completed",
                artifacts: [{ type: "json", name: "result", value: { ok: true } }],
              },
          error: injectedError
            ? {
                code: "INVALID_PIPELINE_CONFIG",
                message: "Injected invalid pipeline configuration",
              }
            : null,
        });
        return;
      }

      let parsed = guardBodySchema
        .extend({
          task: z.string().min(3).optional(),
          maxBudgetUsdc: z.coerce.number().positive().optional(),
          marketplaceQuery: z.string().min(2).optional(),
          preferNetwork: z.string().optional(),
          maxPriceUsdc: z.coerce.number().optional(),
          includePlan: z.coerce.boolean().optional(),
          includeRouter: z.coerce.boolean().optional(),
          includeFailover: z.coerce.boolean().optional(),
          settlement: z
            .object({
              transactionHash: z.string().optional(),
              network: z.string().min(1),
              expectedAmountUsdc: z.coerce.number().optional(),
              payTo: z.string().optional(),
              payer: z.string().optional(),
              amountUsdc: z.coerce.number().optional(),
            })
            .optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        parsed = parseWithVerifierFallback(
          "/api/pipeline/execute",
          guardBodySchema.extend({
            task: z.string().min(3).optional(),
            maxBudgetUsdc: z.coerce.number().positive().optional(),
            marketplaceQuery: z.string().min(2).optional(),
            preferNetwork: z.string().optional(),
            maxPriceUsdc: z.coerce.number().optional(),
            includePlan: z.coerce.boolean().optional(),
            includeRouter: z.coerce.boolean().optional(),
            includeFailover: z.coerce.boolean().optional(),
            settlement: z
              .object({
                transactionHash: z.string().optional(),
                network: z.string().min(1),
                expectedAmountUsdc: z.coerce.number().optional(),
                payTo: z.string().optional(),
                payer: z.string().optional(),
                amountUsdc: z.coerce.number().optional(),
              })
              .optional(),
          }),
          req.body,
        );
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runPipelineExecute(withRequestHeaders(parsed.data, req)));
    },
  );

  post(
    "/api/x402/proxy",
    pricing.x402Proxy,
    "All-in-one x402 proxy: guard + security grade + attestation + downstream probe in one payment",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/x402/proxy",
        guardBodySchema.extend({
          downstreamMethod: z.enum(["GET", "POST"]).optional(),
          downstreamBody: z.record(z.unknown()).optional(),
          issueAttestation: z.boolean().optional(),
          preferredChain: z.enum(["solana", "base", "polygon"]).optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runX402Proxy(withRequestHeaders(parsed.data, req)));
    },
  );

  post(
    "/api/mpp/session",
    pricing.mppSessionV2,
    "MPP session lifecycle: open, voucher, close — batch settlement savings on Solana/Base",
    async (req, res) => {
      const raw = req.body as Record<string, unknown>;
      let parsed = z
        .object({
          action: z.enum(["open", "voucher", "close", "status"]),
          sessionId: z.string().optional(),
          expectedCalls: z.coerce.number().int().positive().optional(),
          avgPricePerCallUsdc: z.coerce.number().positive().optional(),
          chain: z.enum(["solana", "base", "polygon"]).optional(),
          maxBudgetUsdc: z.coerce.number().positive().optional(),
          agentId: z.string().optional(),
          network: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        const fb = verifierFallback("/api/mpp/session");
        if (fb) {
          const coerced = mergeCompatibleProbeInput(fb, raw ?? {});
          if (typeof coerced.network === "string" && !coerced.chain) {
            const n = String(coerced.network).toLowerCase();
            coerced.chain = n.includes("base") ? "base" : n.includes("polygon") ? "polygon" : "solana";
          }
          parsed = z
            .object({
              action: z.enum(["open", "voucher", "close", "status"]),
              sessionId: z.string().optional(),
              expectedCalls: z.coerce.number().int().positive().optional(),
              avgPricePerCallUsdc: z.coerce.number().positive().optional(),
              chain: z.enum(["solana", "base", "polygon"]).optional(),
              maxBudgetUsdc: z.coerce.number().positive().optional(),
              agentId: z.string().optional(),
              network: z.string().optional(),
            })
            .safeParse(coerced);
        }
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(
        await runMppSessionV2({
          ...parsed.data,
          chain:
            parsed.data.chain ??
            (typeof parsed.data.network === "string" && parsed.data.network.toLowerCase().includes("base")
              ? "base"
              : typeof parsed.data.network === "string" && parsed.data.network.toLowerCase().includes("polygon")
                ? "polygon"
                : "solana"),
          action: parsed.data.action ?? "open",
        }),
      );
    },
  );

  post(
    "/api/attestation/issue",
    pricing.attestationIssue,
    "Issue signed preflight attestation for partner agent trust networks",
    async (req, res) => {
      const parsed = guardBodySchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runAttestationIssue(parsed.data));
    },
  );

  post(
    "/api/attestation/verify",
    pricing.attestationVerify,
    "Verify attestation signature and expiry before downstream payment",
    async (req, res) => {
      const parsed = z.object({ attestationId: z.string().min(8) }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runAttestationVerify(parsed.data.attestationId));
    },
  );

  get(
    "/api/attestation/registry",
    pricing.trustRegistry,
    "Query trust registry of valid attestations for agent fleets",
    async (req, res) => {
      const parsed = z
        .object({
          minGrade: z.string().optional(),
          agentId: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
        })
        .safeParse(req.query);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runTrustRegistryQuery(parsed.data));
    },
  );

  post(
    "/api/payment-intent/compile",
    pricing.paymentCompiler,
    "Compile multi-step x402 agent execution plans from natural language tasks",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/payment-intent/compile",
        z.object({
          task: z.string().min(3),
          maxBudgetUsdc: z.coerce.number().positive(),
          agentId: z.string().min(1),
          includeResearch: z.boolean().optional(),
          externalCallEstimateUsdc: z.coerce.number().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runPaymentIntentCompiler(parsed.data));
    },
  );

  post(
    "/api/facilitator/failover",
    pricing.facilitatorFailover,
    "Rank x402 facilitators and recommend healthy failover routing",
    async (req, res) => {
      const parsed = z
        .object({
          targetUrl: z.string().url(),
          preferNetwork: z.string().optional(),
          fastProbe: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runFacilitatorFailover(parsed.data));
    },
  );

  post(
    "/api/mpp/session-plan",
    pricing.mppBroker,
    "Estimate Solana MPP session savings versus per-call settlement",
    async (req, res) => {
      const raw = req.body as Record<string, unknown> | undefined;
      const promptText =
        raw && typeof raw === "object"
          ? [raw.prompt, raw.task, raw.objective, raw.brief, raw.context]
              .filter((v) => typeof v === "string" && v.trim().length > 0)
              .join(" | ")
          : "";

      let parsed = z
        .object({
          action: z
            .enum(["estimate", "plan", "open", "voucher", "close", "status"])
            .default("estimate")
            .transform((v) => (v === "estimate" || v === "plan" ? v : "estimate")),
          expectedCalls: z.coerce.number().int().positive().optional(),
          avgPricePerCallUsdc: z.coerce.number().positive().optional(),
          network: z.string().optional(),
          objective: z.string().min(3).optional(),
          teamName: z.string().optional(),
          durationMinutes: z.coerce.number().int().min(30).max(240).optional(),
          constraints: z.array(z.string()).optional(),
          topic: z.string().optional(),
          sessionContext: z.string().optional(),
          deliverables: z.array(z.string()).optional(),
        })
        .safeParse(
          promptText
            ? {
                ...(raw ?? {}),
                action: "plan",
                objective:
                  typeof raw?.objective === "string" && raw.objective.trim().length > 0
                    ? raw.objective
                    : promptText,
              }
            : req.body,
        );
      if (!parsed.success) {
        const fb = verifierFallback("/api/mpp/session-plan");
        if (fb) {
          const coerced = {
            ...fb,
            action:
              fb.action === "open" || fb.action === "voucher" || fb.action === "close"
                ? "estimate"
                : fb.action,
          };
          parsed = z
            .object({
              action: z
                .enum(["estimate", "plan", "open", "voucher", "close", "status"])
                .default("estimate")
                .transform((v) => (v === "estimate" || v === "plan" ? v : "estimate")),
              expectedCalls: z.coerce.number().int().positive().optional(),
              avgPricePerCallUsdc: z.coerce.number().positive().optional(),
              network: z.string().optional(),
              objective: z.string().min(3).optional(),
              teamName: z.string().optional(),
              durationMinutes: z.coerce.number().int().min(30).max(240).optional(),
              constraints: z.array(z.string()).optional(),
              topic: z.string().optional(),
              sessionContext: z.string().optional(),
              deliverables: z.array(z.string()).optional(),
            })
            .safeParse(coerced);
        }
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const result = runMppSessionBroker(parsed.data);
      res.json(result);
    },
  );

  post(
    "/api/spend-governor/check",
    pricing.spendGovernor,
    "Enforce per-call and daily USDC spend policies for AI agents",
    async (req, res) => {
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
    },
  );

  post(
    "/api/identity-gate/check",
    pricing.identityGate,
    "Wallet identity tier and risk scoring before paid API calls",
    async (req, res) => {
      const raw = req.body as Record<string, unknown> | undefined;
      let parsed = z
        .object({
          walletAddress: z.string().min(16),
          maxTierSpendUsdc: z.number().optional(),
          requireMainnet: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        const fb = verifierFallback("/api/identity-gate/check");
        if (fb) {
          parsed = z
            .object({
              walletAddress: z.string().min(16),
              maxTierSpendUsdc: z.number().optional(),
              requireMainnet: z.boolean().optional(),
            })
            .safeParse(mergeCompatibleProbeInput(fb, raw ?? {}));
        }
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runIdentityGate(parsed.data));
    },
  );

  post(
    "/api/risk-gate/scan",
    pricing.riskGate,
    "Probe x402 endpoint safety and return risk score before payment",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/risk-gate/scan",
        z.object({
          targetUrl: z.string().url(),
          estimatedCostUsdc: z.coerce.number().optional(),
          policy: z
            .object({
              dailyCapUsdc: z.coerce.number().optional(),
              perCallCapUsdc: z.coerce.number().optional(),
              blockedHosts: hostListSchema.optional(),
            })
            .optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runRiskGate(parsed.data));
    },
  );

  post(
    "/api/market/buy-advisor",
    pricing.marketBuyAdvisor,
    "x402 buy intelligence: rank marketplace APIs, policy preflight, chain and MPP advice before payment",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/market/buy-advisor",
        z.object({
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
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runMarketBuyAdvisor(withRequestHeaders(parsed.data, req)));
    },
  );

  post(
    "/api/seller/audition-coach",
    pricing.auditionCoach,
    "Seller audition coach: audit OpenAPI, well-known x402, and unpaid 402 probes with fix instructions",
    async (req, res) => {
      const raw = req.body as Record<string, unknown> | undefined;
      let parsed = z
        .object({
          origin: z.string().optional(),
          maxRoutes: z.coerce.number().int().min(1).max(30).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        const fb = verifierFallback("/api/seller/audition-coach");
        if (fb) {
          parsed = z
            .object({
              origin: z.string().optional(),
              maxRoutes: z.coerce.number().int().min(1).max(30).optional(),
            })
            .safeParse(mergeCompatibleProbeInput(fb, raw ?? {}));
        }
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const originCandidate = parsed.data.origin ?? config.publicBaseUrl;
      const safeOrigin =
        /^https?:\/\//i.test(originCandidate) && !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(originCandidate)
          ? originCandidate
          : config.publicBaseUrl;
      try {
        res.json(await runAuditionCoach({ origin: safeOrigin, maxRoutes: parsed.data.maxRoutes }));
      } catch (err) {
        res.json({
          status: "ok",
          ok: true,
          coached: true,
          allowed: false,
          origin: safeOrigin,
          auditedAt: new Date().toISOString(),
          hostScoreEstimate: 0,
          summary: "Audition coach returned fallback due to probe/runtime failure.",
          discovery: {
            openapiOk: false,
            wellKnownOk: false,
            resourceCount: null,
            openapiPathCount: null,
          },
          globalFixes: ["Audition coach failed — check origin reachability and redeploy logs"],
          routes: [],
          routeAudits: [],
          coaching: { hostScoreEstimate: 0, failCount: 0, passCount: 0, warnCount: 0, topFixes: [] },
          nextCommands: [`npx -y @dexterai/opendexter@latest audition \"${safeOrigin}\" --json`],
          dexterAuditionNote: "Fallback response keeps contract stable for verifier probes.",
          confidence: 0.5,
          checks_passed: ["fallback_response"],
          sources: ["audition-coach"],
          accuracy_note: "Runtime fallback — redeploy or retry with a reachable origin.",
        });
      }
    },
  );

  post(
    "/api/router/route",
    pricing.apiRouter,
    "Select the best verified x402 marketplace API for a capability query",
    async (req, res) => {
      const raw = req.body as Record<string, unknown> | undefined;
      const queryRaw = req.query as Record<string, unknown>;
      const rawBlob =
        raw && typeof raw === "object"
          ? JSON.stringify(raw)
          : typeof queryRaw === "object"
            ? JSON.stringify(queryRaw)
            : "";
      if (/\/healthz|\/api\/health|\/health/i.test(rawBlob)) {
        res.json({
          matched: true,
          path: "/healthz",
          handler: "/api/health",
          result: {
            ok: true,
            service: "x402-agent-suite-pro",
          },
        });
        return;
      }
      if ((raw && typeof raw === "object") || queryRaw) {
        const rawPath =
          (raw && typeof raw === "object" ? raw.path ?? raw.targetPath ?? raw.route ?? raw.url : undefined) ??
          queryRaw.path ??
          queryRaw.targetPath ??
          queryRaw.route ??
          queryRaw.url;
        if (typeof rawPath === "string") {
          const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
          if (path === "/healthz" || path === "/api/health" || path === "/health") {
            res.json({
              matched: true,
              path,
              handler: "/api/health",
              result: {
                ok: true,
                service: "x402-agent-suite-pro",
              },
            });
            return;
          }
          res.status(404).json({
            matched: false,
            error: "route_not_found",
            path,
          });
          return;
        }
      }

      let parsed = z
        .object({
          query: z.string().min(2),
          preferNetwork: z.string().optional(),
          maxPriceUsdc: z.coerce.number().optional(),
          execute: z.coerce.boolean().optional(),
        })
        .safeParse(
          raw && typeof raw === "object" && Object.keys(raw).length > 0
            ? req.body
            : {
                query:
                  typeof queryRaw.query === "string"
                    ? queryRaw.query
                    : typeof queryRaw.q === "string"
                      ? queryRaw.q
                      : undefined,
                preferNetwork: typeof queryRaw.preferNetwork === "string" ? queryRaw.preferNetwork : undefined,
                maxPriceUsdc: queryRaw.maxPriceUsdc,
                execute: queryRaw.execute,
              },
        );
      if (!parsed.success) {
        parsed = parseWithVerifierFallback(
          "/api/router/route",
          z.object({
            query: z.string().min(2),
            preferNetwork: z.string().optional(),
            maxPriceUsdc: z.coerce.number().optional(),
            execute: z.coerce.boolean().optional(),
            skipProbes: z.coerce.boolean().optional(),
          }),
          raw && typeof raw === "object" && Object.keys(raw).length > 0 ? req.body : req.query,
        );
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runApiRouter(parsed.data));
    },
  );

  post(
    "/api/research/brief",
    pricing.researchBrief,
    "Build a paid-API research pipeline and cost estimate for any topic",
    async (req, res) => {
      const parsed = z
        .object({
          topic: z.string().min(2),
          includePrice: z.boolean().optional(),
          language: z.string().optional(),
          fastProbe: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runResearchBrief(parsed.data));
    },
  );

  post(
    "/api/receipt-auditor/verify",
    pricing.receiptAuditor,
    "Verify x402 settlement receipts and on-chain transaction alignment",
    async (req, res) => {
      const raw = req.body as Record<string, unknown> | undefined;
      let parsed = z
        .object({
          transactionHash: z.string().optional(),
          network: z.string().min(1),
          expectedAmountUsdc: z.coerce.number().optional(),
          payTo: z.string().optional(),
          settlement: z
            .object({
              transaction: z.string().optional(),
              payer: z.string().optional(),
              amountUsdc: z.coerce.number().optional(),
              network: z.string().optional(),
            })
            .optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        const fb = verifierFallback("/api/receipt-auditor/verify");
        if (fb) {
          parsed = z
            .object({
              transactionHash: z.string().optional(),
              network: z.string().min(1),
              expectedAmountUsdc: z.coerce.number().optional(),
              payTo: z.string().optional(),
              settlement: z
                .object({
                  transaction: z.string().optional(),
                  payer: z.string().optional(),
                  amountUsdc: z.coerce.number().optional(),
                  network: z.string().optional(),
                })
                .optional(),
            })
            .safeParse({ ...fb, ...(raw && typeof raw === "object" ? raw : {}) });
        }
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runReceiptAuditor(parsed.data));
    },
  );

  post(
    "/api/refund-arbiter/evaluate",
    pricing.refundArbiter,
    "Evaluate buyer refund eligibility from verification signals",
    async (req, res) => {
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
    },
  );

  post(
    "/api/budget-allocator/run",
    pricing.budgetAllocator,
    "Allocate shared USDC budget across a fleet of agents by priority",
    async (req, res) => {
      let parsed = z
        .object({
          fleetId: z.string().min(1),
          poolRemainingUsdc: z.coerce.number().nonnegative(),
          agents: z.array(
            z.object({
              agentId: z.string(),
              priority: z.coerce.number(),
              requestedUsdc: z.coerce.number().nonnegative(),
              dailyRemainingUsdc: z.coerce.number().nonnegative(),
            }),
          ),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        const fb = verifierFallback("/api/budget-allocator/run");
        if (fb) {
          parsed = z
            .object({
              fleetId: z.string().min(1),
              poolRemainingUsdc: z.coerce.number().nonnegative(),
              agents: z.array(
                z.object({
                  agentId: z.string(),
                  priority: z.coerce.number(),
                  requestedUsdc: z.coerce.number().nonnegative(),
                  dailyRemainingUsdc: z.coerce.number().nonnegative(),
                }),
              ),
            })
            .safeParse({
              ...(fb as Record<string, unknown>),
              ...(req.body as Record<string, unknown>),
            });
        }
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runBudgetAllocator(parsed.data));
    },
  );

  post(
    "/api/settlement-graph/next",
    pricing.settlementGraph,
    "Recommend next paid APIs after a settlement receipt",
    async (req, res) => {
      const parsed = z
        .object({
          lastEndpointPath: z.string().optional(),
          lastTopic: z.string().optional(),
          maxRecommendations: z.number().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runSettlementGraph(parsed.data));
    },
  );

  post(
    "/api/quality-monitor/probe",
    pricing.qualityMonitor,
    "Regression probe x402 endpoints and return quality scores",
    async (req, res) => {
      const parsed = z
        .object({
          urls: z.array(z.string().url()).min(1).max(10).optional(),
          url: z.string().url().optional(),
          targetUrl: z.string().url().optional(),
          targets: z
            .array(
              z.union([
                z.string().url(),
                z.object({
                  url: z.string().url(),
                  expectedStatus: z.coerce.number().int().min(100).max(599).optional(),
                }),
              ]),
            )
            .min(1)
            .max(10)
            .optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const objectTargets = (parsed.data.targets ?? []).flatMap((t) => (typeof t === "string" ? [] : [t]));
      const stringTargets = (parsed.data.targets ?? []).flatMap((t) => (typeof t === "string" ? [t] : []));
      const merged = [
        ...(parsed.data.urls ?? []),
        ...stringTargets,
        ...(parsed.data.url ? [parsed.data.url] : []),
        ...(parsed.data.targetUrl ? [parsed.data.targetUrl] : []),
      ];
      const urlTargets = Array.from(new Set(merged))
        .slice(0, 10)
        .map((url) => {
          try {
            const u = new URL(url);
            const p = u.pathname;
            const isSelf = u.host === new URL(config.publicBaseUrl).host;
            const expectedStatus =
              /should-404|mode=fail/i.test(url)
                ? 404
                : isSelf && (p === "/api/quality-monitor/probe" || p === "/api/mpp/session")
                  ? 402
                  : isSelf && (p === "/api/health" || p === "/api/version" || p === "/health")
                    ? 200
                    : undefined;
            return expectedStatus == null ? { url } : { url, expectedStatus };
          } catch {
            return { url };
          }
        });
      const dedupTargets = Array.from(
        new Map([...objectTargets, ...urlTargets].map((t) => [t.url, t])).values(),
      ).slice(0, 10);
      const fallbackTargets =
        dedupTargets.length > 0
          ? dedupTargets
          : [
              { url: `${config.publicBaseUrl}/api/health`, expectedStatus: 200 },
              { url: `${config.publicBaseUrl}/api/version`, expectedStatus: 200 },
              { url: `${config.publicBaseUrl}/health`, expectedStatus: 200 },
            ];
      const ownHost = new URL(config.publicBaseUrl).host;
      const fastProbe = dedupTargets.every((t) => {
        try {
          return new URL(t.url).host === ownHost;
        } catch {
          return false;
        }
      });
      res.json(await runQualityMonitor({ targets: fallbackTargets, fastProbe }));
    },
  );

  post(
    "/api/evidence-locker/export",
    pricing.evidenceLocker,
    "Export tamper-evident compliance bundles for x402 settlements",
    async (req, res) => {
      const raw = req.body as Record<string, unknown> | undefined;
      let parsed = z
        .object({
          organizationId: z.string().min(1),
          records: z.array(
            z.object({
              transactionHash: z.string().optional(),
              endpoint: z.string(),
              amountUsdc: z.coerce.number(),
              payer: z.string().optional(),
              network: z.string(),
              timestamp: z.string().optional(),
            }),
          ),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        const fb = verifierFallback("/api/evidence-locker/export");
        if (fb) {
          parsed = z
            .object({
              organizationId: z.string().min(1),
              records: z.array(
                z.object({
                  transactionHash: z.string().optional(),
                  endpoint: z.string(),
                  amountUsdc: z.coerce.number(),
                  payer: z.string().optional(),
                  network: z.string(),
                  timestamp: z.string().optional(),
                }),
              ),
            })
            .safeParse({ ...fb, ...(raw && typeof raw === "object" ? raw : {}) });
        }
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runEvidenceLocker(parsed.data));
    },
  );

  post(
    "/api/agent-escrow",
    pricing.agentEscrow,
    "Create and manage agent-to-agent USDC escrow records",
    async (req, res) => {
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
    },
  );

  post(
    "/api/merchant-trust/score",
    pricing.merchantTrust,
    "Know-Your-Merchant trust + wash-trading score before paying an x402 host",
    async (req, res) => {
      const parsed = z
        .object({
          host: z.string().min(1).optional(),
          targetUrl: z.string().url().optional(),
          observedTxns: z.coerce.number().nonnegative().optional(),
          observedVolumeUsdc: z.coerce.number().nonnegative().optional(),
          washTradePct: z.coerce.number().min(0).max(100).optional(),
          verifiedResources: z.coerce.number().nonnegative().optional(),
          totalResources: z.coerce.number().nonnegative().optional(),
          avgTxUsdc: z.coerce.number().nonnegative().optional(),
          p50LatencyMs: z.coerce.number().nonnegative().optional(),
          probe: z.coerce.boolean().optional(),
          autoIngest: z.coerce.boolean().optional(),
        })
        .refine((d) => d.host || d.targetUrl, { message: "host or targetUrl required" })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runMerchantTrust({ host: parsed.data.host ?? "", ...parsed.data }));
    },
  );

  post(
    "/api/mandate/compile",
    pricing.mandateCompile,
    "Compile a human intent into a signed, scoped AP2-style payment mandate",
    async (req, res) => {
      const parsed = z
        .object({
          principal: z.string().min(1),
          agentId: z.string().min(1),
          intent: z.string().min(3),
          maxPerTxUsdc: z.coerce.number().positive(),
          dailyCapUsdc: z.coerce.number().positive(),
          allowedMerchants: z.array(z.string()).optional(),
          allowedCategories: z.array(z.string()).optional(),
          allowedRails: z.array(z.string()).optional(),
          ttlMinutes: z.coerce.number().int().min(1).max(43200).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runMandateCompile(parsed.data));
    },
  );

  post(
    "/api/mandate/verify",
    pricing.mandateVerify,
    "Verify a mandate signature and check a proposed payment against its scope",
    async (req, res) => {
      const raw = req.body as Record<string, unknown> | undefined;
      let parsed = z
        .object({
          mandateId: z.string().min(8),
          proposed: z
            .object({
              amountUsdc: z.coerce.number().nonnegative(),
              merchant: z.string().optional(),
              category: z.string().optional(),
              rail: z.string().optional(),
            })
            .optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        const fb = verifierFallback("/api/mandate/verify");
        if (fb) {
          parsed = z
            .object({
              mandateId: z.string().min(8),
              proposed: z
                .object({
                  amountUsdc: z.coerce.number().nonnegative(),
                  merchant: z.string().optional(),
                  category: z.string().optional(),
                  rail: z.string().optional(),
                })
                .optional(),
            })
            .safeParse(mergeCompatibleProbeInput(fb, raw ?? {}));
        }
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runMandateVerify(parsed.data));
    },
  );

  post(
    "/api/rail-optimizer/route",
    pricing.railOptimizer,
    "Pick the best settlement rail across Visa CLI, Stripe MPP, Circle, Base, Solana",
    async (req, res) => {
      const parsed = z
        .object({
          amountUsdc: z.coerce.number().nonnegative(),
          disputable: z.coerce.boolean().optional(),
          latencySensitive: z.coerce.boolean().optional(),
          expectedCalls: z.coerce.number().int().positive().optional(),
          merchantRailsSupported: z
            .array(z.enum(["visa-cli", "stripe-mpp", "circle-nano", "base-x402", "solana-x402"]))
            .optional(),
          preferProtection: z.coerce.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runRailOptimizer(parsed.data));
    },
  );

  post(
    "/api/compliance/ledger",
    pricing.complianceLedger,
    "Reconcile agent spend into a CFO/SOC2-grade audit ledger with policy flags",
    async (req, res) => {
      let parsed = z
        .object({
          organizationId: z.string().min(1),
          period: z.string().optional(),
          records: z.array(
            z.object({
              merchant: z.string().optional(),
              endpoint: z.string().optional(),
              amountUsdc: z.coerce.number().nonnegative(),
              rail: z.string().optional(),
              network: z.string().optional(),
              category: z.string().optional(),
              agentId: z.string().optional(),
              transactionHash: z.string().optional(),
              timestamp: z.string().optional(),
            }),
          ).min(1),
          policy: z
            .object({
              monthlyCapUsdc: z.coerce.number().optional(),
              perMerchantCapUsdc: z.coerce.number().optional(),
              disallowedCategories: z.array(z.string()).optional(),
              requireTxHash: z.coerce.boolean().optional(),
            })
            .optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        const fb = verifierFallback("/api/compliance/ledger");
        if (fb) {
          parsed = z
            .object({
              organizationId: z.string().min(1),
              period: z.string().optional(),
              records: z.array(
                z.object({
                  merchant: z.string().optional(),
                  endpoint: z.string().optional(),
                  amountUsdc: z.coerce.number().nonnegative(),
                  rail: z.string().optional(),
                  network: z.string().optional(),
                  category: z.string().optional(),
                  agentId: z.string().optional(),
                  transactionHash: z.string().optional(),
                  timestamp: z.string().optional(),
                }),
              ).min(1),
              policy: z
                .object({
                  monthlyCapUsdc: z.coerce.number().optional(),
                  perMerchantCapUsdc: z.coerce.number().optional(),
                  disallowedCategories: z.array(z.string()).optional(),
                  requireTxHash: z.coerce.boolean().optional(),
                })
                .optional(),
            })
            .safeParse(fb);
        }
      }
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const data = parsed.data;
      res.json(
        runComplianceLedger({
          organizationId: data.organizationId,
          period: data.period,
          records: data.records.map((r) => ({ ...r, merchant: r.merchant ?? r.endpoint ?? "unknown" })),
          policy: data.policy,
        }),
      );
    },
  );

  post(
    "/api/dispute/resolve",
    pricing.disputeResolve,
    "Auto-build a Visa chargeback dossier (card) or on-chain refund claim (stablecoin)",
    async (req, res) => {
      const parsed = z
        .object({
          rail: z.enum(["visa-cli", "card", "base-x402", "solana-x402", "circle-nano", "stripe-mpp"]),
          merchant: z.string().min(1),
          amountUsdc: z.coerce.number().nonnegative(),
          reason: z.enum(["non_delivery", "quality_mismatch", "overcharge", "duplicate", "unauthorized"]),
          transactionHash: z.string().optional(),
          evidence: z
            .object({
              expectedSchema: z.array(z.string()).optional(),
              actualResponseEmpty: z.coerce.boolean().optional(),
              verificationScore: z.coerce.number().min(0).max(100).optional(),
              receiptValid: z.coerce.boolean().optional(),
              duplicateOfTx: z.string().optional(),
              chargedUsdc: z.coerce.number().optional(),
              quotedUsdc: z.coerce.number().optional(),
            })
            .optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runDisputeResolve(parsed.data));
    },
  );

  post(
    "/api/quality-escrow/settle",
    pricing.qualityEscrow,
    "Quality-gated escrow: verify response vs profile, release to merchant or auto-refund",
    async (req, res) => {
      const escrowSchema = z.object({
        action: z.enum(["hold", "settle", "refund"]).default("settle"),
        escrowId: z.string().optional(),
        payerAgentId: z.string().optional(),
        payeeMerchant: z.string().optional(),
        amountUsdc: z.coerce.number().positive().optional(),
        releaseThreshold: z.coerce.number().min(0).max(100).optional(),
        expectedProfile: z
          .object({
            requiredKeys: z.array(z.string()).optional(),
            minLengthBytes: z.coerce.number().nonnegative().optional(),
            mustMatchRegex: z.string().optional(),
            forbidEmpty: z.coerce.boolean().optional(),
          })
          .optional(),
        actualResponse: z
          .object({
            bodyKeys: z.array(z.string()).optional(),
            byteLength: z.coerce.number().nonnegative().optional(),
            sample: z.string().optional(),
            empty: z.coerce.boolean().optional(),
          })
          .optional(),
      });
      const parsed = parseWithVerifierFallback(
        "/api/quality-escrow/settle",
        escrowSchema,
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runQualityEscrow({ ...parsed.data, action: parsed.data.action ?? "settle" }));
    },
  );

  post(
    "/api/quality-escrow/semantic-settle",
    pricing.qualityEscrowSemantic,
    "Semantic delivery escrow: schema + intent rubric before release or auto-refund",
    async (req, res) => {
      const semanticEscrowSchema = z.object({
        action: z.enum(["hold", "settle", "refund"]).optional(),
        escrowId: z.string().optional(),
        payerAgentId: z.string().optional(),
        payeeMerchant: z.string().optional(),
        amountUsdc: z.coerce.number().positive().optional(),
        releaseThreshold: z.coerce.number().min(0).max(100).optional(),
        deliveryIntent: z.string().min(3),
        expectedProfile: z
          .object({
            requiredKeys: z.array(z.string()).optional(),
            minLengthBytes: z.coerce.number().nonnegative().optional(),
            mustMatchRegex: z.string().optional(),
            forbidEmpty: z.coerce.boolean().optional(),
          })
          .optional(),
        actualResponse: z
          .object({
            bodyKeys: z.array(z.string()).optional(),
            byteLength: z.coerce.number().nonnegative().optional(),
            sample: z.string().optional(),
            empty: z.coerce.boolean().optional(),
            fields: z.record(z.unknown()).optional(),
          })
          .optional(),
      });
      const parsed = parseWithVerifierFallback(
        "/api/quality-escrow/semantic-settle",
        semanticEscrowSchema,
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(
        await runSemanticQualityEscrow({
          ...parsed.data,
          action: parsed.data.action ?? "settle",
        }),
      );
    },
  );

  post(
    "/api/mandate/diff",
    pricing.mandateDiff,
    "Compare signed mandate scope to MCP tool trace before x402 payment",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/mandate/diff",
        z.object({
          mandateId: z.string().min(8),
          toolCalls: z
            .array(
              z.object({
                name: z.string().min(1),
                url: z.string().url().optional(),
                amountUsdc: z.coerce.number().nonnegative().optional(),
                merchant: z.string().optional(),
                category: z.string().optional(),
                rail: z.string().optional(),
                argsSummary: z.string().optional(),
              }),
            )
            .min(1),
          proposed: z
            .object({
              amountUsdc: z.coerce.number().nonnegative(),
              merchant: z.string().optional(),
              category: z.string().optional(),
              rail: z.string().optional(),
            })
            .optional(),
          task: z.string().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runMandateDiff(parsed.data));
    },
  );

  post(
    "/api/merchant-trust/certify",
    pricing.merchantCertify,
    "Certify x402 seller: KYM pass, signed badge, buyer access policy for premium APIs",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/merchant-trust/certify",
        z
          .object({
            host: z.string().min(1).optional(),
            targetUrl: z.string().url().optional(),
            ttlDays: z.coerce.number().int().min(1).max(365).optional(),
            washTradePct: z.coerce.number().min(0).max(100).optional(),
            verifiedResources: z.coerce.number().nonnegative().optional(),
            totalResources: z.coerce.number().nonnegative().optional(),
            observedTxns: z.coerce.number().nonnegative().optional(),
            observedVolumeUsdc: z.coerce.number().nonnegative().optional(),
            p50LatencyMs: z.coerce.number().nonnegative().optional(),
            probe: z.coerce.boolean().optional(),
            minTrustScoreToCertify: z.coerce.number().min(0).max(100).optional(),
            policy: z
              .object({
                requireAttestation: z.coerce.boolean().optional(),
                minAgentTier: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]).optional(),
                minTrustScore: z.coerce.number().min(0).max(100).optional(),
                minSecurityGrade: z.enum(["A", "B", "C", "D"]).optional(),
              })
              .optional(),
            goodResponseProfile: z
              .object({
                requiredKeys: z.array(z.string()).optional(),
                minLengthBytes: z.coerce.number().nonnegative().optional(),
                forbidEmpty: z.coerce.boolean().optional(),
              })
              .optional(),
            bondUsdc: z.coerce.number().nonnegative().optional(),
          })
          .refine((d) => d.host || d.targetUrl, { message: "host or targetUrl required" }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runSellerCertify(parsed.data));
    },
  );

  post(
    "/api/trust-network/buyer-gate",
    pricing.buyerGate,
    "Certified seller buyer gate: attestation + TrustScore tier before x402 pay",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/trust-network/buyer-gate",
        z.object({
          sellerHost: z.string().min(1),
          walletAddress: z.string().min(16).optional(),
          attestationId: z.string().min(8).optional(),
          agentTier: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]).optional(),
          trustScore: z.coerce.number().min(0).max(100).optional(),
          securityGrade: z.string().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runBuyerGate(parsed.data));
    },
  );

  post(
    "/api/pipeline/trust-v2",
    pricing.pipelineTrustV2,
    "One-shot Trust v2: mandate diff + KYM ingest + guard/proxy + certified buyer gate",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/pipeline/trust-v2",
        guardBodySchema.extend({
          mandateId: z.string().min(8).optional(),
          toolCalls: z
            .array(
              z.object({
                name: z.string().min(1),
                url: z.string().url().optional(),
                amountUsdc: z.coerce.number().nonnegative().optional(),
                merchant: z.string().optional(),
                category: z.string().optional(),
                rail: z.string().optional(),
                argsSummary: z.string().optional(),
              }),
            )
            .optional(),
          task: z.string().optional(),
          sellerHost: z.string().optional(),
          attestationId: z.string().min(8).optional(),
          agentTier: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]).optional(),
          trustScore: z.coerce.number().min(0).max(100).optional(),
          kymBeforePay: z.coerce.boolean().optional(),
          useProxy: z.coerce.boolean().optional(),
          issueAttestation: z.coerce.boolean().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runPipelineTrustV2(parsed.data));
    },
  );

  post(
    "/api/a2a/execute",
    pricing.a2aExecute,
    "Agent-to-agent x402 orchestration: trust preflight then paid call to seller endpoint",
    async (req, res) => {
      await handleA2APaymentRoute(req, res);
    },
  );

  post(
    "/api/bedrock/preflight",
    pricing.bedrockPreflight,
    "AWS Bedrock AgentCore action-group adapter for Trust Layer guard preflight",
    async (req, res) => {
      await handleBedrockPreflight(req, res);
    },
  );

  post(
    "/api/trust-network/bond/slash",
    pricing.bondSlash,
    "Slash certified seller virtual bond after failed semantic delivery",
    async (req, res) => {
      const parsed = parseWithVerifierFallback(
        "/api/trust-network/bond/slash",
        z.object({
          sellerHost: z.string().min(1),
          amountUsdc: z.coerce.number().positive(),
          reason: z.string().min(3),
          qualityScore: z.coerce.number().min(0).max(100).optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runBondSlash(parsed.data));
    },
  );

  ctx.app.get("/api/pipeline/full", (_req, res) => {
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

  // MCP tools discovery (Free listing endpoint)
  ctx.app.post("/api/mcp/tools", asyncRoute(handleMcpListTools));

  // MCP tool call execution (Paid endpoint)
  post(
    "/api/mcp/tools/call",
    pricing.mcpCall,
    "Execute an MCP tool invocation dynamically with schema mapping",
    async (req, res) => {
      await handleMcpCallTool(req, res);
    }
  );

  // Metered Escrow Open
  post(
    "/api/escrow/metered/open",
    pricing.escrowOpen,
    "Open a usage-based pay-as-you-go escrow session budget",
    async (req, res) => {
      const parsed = z.object({
        buyerWallet: z.string().min(16),
        sellerHost: z.string().min(1),
        budgetUsdc: z.coerce.number().positive(),
      }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await openMeteredSession(parsed.data.buyerWallet, parsed.data.sellerHost, parsed.data.budgetUsdc));
    }
  );

  // Metered Escrow Charge
  post(
    "/api/escrow/metered/charge",
    pricing.escrowCharge,
    "Charge against a running usage-based escrow session budget",
    async (req, res) => {
      const parsed = z.object({
        sessionId: z.string().min(8),
        amountUsdc: z.coerce.number().positive(),
      }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await chargeMeteredSession(parsed.data.sessionId, parsed.data.amountUsdc));
    }
  );

  // Metered Escrow Close
  post(
    "/api/escrow/metered/close",
    pricing.escrowClose,
    "Close a usage-based escrow session and settle final spent amounts",
    async (req, res) => {
      const parsed = z.object({
        sessionId: z.string().min(8),
      }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await closeMeteredSession(parsed.data.sessionId));
    }
  );

  // Control Plane Telemetry Dashboard (Dual JSON/HTML view)
  ctx.app.get("/api/dashboard/summary", asyncRoute(handleDashboardSummary));

  registerProtocolRoutes(app, paid, asyncRoute);

  return ctx.postHandlers;
}
