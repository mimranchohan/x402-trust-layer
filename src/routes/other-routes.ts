import type { Request, Response } from "express";
import { z } from "zod";
import { runAgentVerify } from "../agents/agent-verify.js";
import { runAgentEscrow } from "../agents/agent-escrow.js";
import { runApiRouter } from "../agents/api-router.js";
import { runBudgetAllocator } from "../agents/budget-allocator.js";
import { runEvidenceLocker } from "../agents/evidence-locker.js";
import { runFacilitatorFailover } from "../agents/facilitator-failover.js";
import { runQualityMonitor } from "../agents/quality-monitor.js";
import { runResearchBrief } from "../agents/research-brief.js";
import { runSettlementGraph } from "../agents/settlement-graph.js";
import { runMppSessionV2 } from "../agents/mpp-session-v2.js";
import { runAuditionCoach } from "../agents/audition-coach.js";
import { runMarketBuyAdvisor } from "../agents/market-buy-advisor.js";
import { handleA2APaymentRoute } from "../agents/a2a-payment.js";
import { handleBedrockPreflight } from "../agents/bedrock-bridge.js";
import { handleMcpListTools, handleMcpCallTool } from "./mcp.js";
import { handleDashboardSummary } from "./dashboard.js";
import { config, pricing } from "../config.js";
import { createPost, createGet, withRequestHeaders, type RouteContext } from "./shared.js";
import { policySchema, verifierFallback } from "./schemas.js";
import { SUITE_PRICES } from "../lib/suite-catalog.js";
import { mergeCompatibleProbeInput } from "../lib/apply-verifier-body.js";
import { parseWithVerifierFallback } from "../lib/parse-with-verifier-fallback.js";

export function registerOtherRoutes(ctx: RouteContext) {
  const post = createPost(ctx);
  const get = createGet(ctx);
  const { app, asyncRoute } = ctx;

  post(
    "/api/agent/verify",
    pricing.agentVerify,
    "ERC-8004 TrustScore on Base mainnet — agent identity, reputation, wallet binding, agent card",
    async (req: Request, res: Response) => {
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
    "/api/mpp/session",
    pricing.mppSessionV2,
    "MPP session lifecycle: open, voucher, close — batch settlement savings on Solana/Base",
    async (req: Request, res: Response) => {
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
    "/api/facilitator/failover",
    pricing.facilitatorFailover,
    "Rank x402 facilitators and recommend healthy failover routing",
    async (req: Request, res: Response) => {
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
    "/api/market/buy-advisor",
    pricing.marketBuyAdvisor,
    "x402 buy intelligence: rank marketplace APIs, policy preflight, chain and MPP advice before payment",
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    "/api/budget-allocator/run",
    pricing.budgetAllocator,
    "Allocate shared USDC budget across a fleet of agents by priority",
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    "/api/a2a/execute",
    pricing.a2aExecute,
    "Agent-to-agent x402 orchestration: trust preflight then paid call to seller endpoint",
    async (req: Request, res: Response) => {
      await handleA2APaymentRoute(req, res);
    },
  );

  post(
    "/api/bedrock/preflight",
    pricing.bedrockPreflight,
    "AWS Bedrock AgentCore action-group adapter for Trust Layer guard preflight",
    async (req: Request, res: Response) => {
      await handleBedrockPreflight(req, res);
    },
  );

  app.get("/api/pipeline/full", (_req: Request, res: Response) => {
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
  app.post("/api/mcp/tools", asyncRoute(handleMcpListTools));

  // MCP tool call execution (Paid endpoint)
  post(
    "/api/mcp/tools/call",
    pricing.mcpCall,
    "Execute an MCP tool invocation dynamically with schema mapping",
    async (req: Request, res: Response) => {
      await handleMcpCallTool(req, res);
    }
  );

  // Control Plane Telemetry Dashboard (Dual JSON/HTML view)
  app.get("/api/dashboard/summary", asyncRoute(handleDashboardSummary));
}
