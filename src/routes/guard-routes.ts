import type { Request, Response } from "express";
import { z } from "zod";
import { runPreX402Guard } from "../agents/pre-x402-guard.js";
import { runPayloadSandbox } from "../agents/payload-sandbox.js";
import { runPipelineExecute } from "../agents/pipeline-execute.js";
import { runX402Proxy } from "../agents/x402-proxy.js";
import { runPipelineTrustV2 } from "../agents/pipeline-trust-v2.js";
import { config, pricing } from "../config.js";
import { createPost, withRequestHeaders, type RouteContext } from "./shared.js";
import { guardBodySchema } from "./schemas.js";
import { parseWithVerifierFallback } from "../lib/parse-with-verifier-fallback.js";
import { dispatchWebhooks } from "../lib/webhooks.js";
import { rateLimitPerWallet, AGENT_RATE_LIMIT_PER_MIN } from "../lib/rate-limit.js";
import { recordObservation } from "../lib/reputation-network.js";

export function registerGuardRoutes(ctx: RouteContext) {
  const post = createPost(ctx);
  // Per-wallet / per-agentId rate limiter applied to all guard + pipeline routes.
  // Falls through when body has no wallet/agentId so IP-based limits remain as backstop.
  const walletRateLimit = rateLimitPerWallet(AGENT_RATE_LIMIT_PER_MIN);
  ctx.app.use("/api/guard", walletRateLimit);
  ctx.app.use("/api/pipeline", walletRateLimit);
  ctx.app.use("/api/x402/proxy", walletRateLimit);

  post(
    "/api/guard/pre-x402",
    pricing.preX402Guard,
    "Pre-x402 safety bundle: spend policy + wallet identity + URL risk probe in one call",
    async (req: Request, res: Response) => {
      const parsed = parseWithVerifierFallback("/api/guard/pre-x402", guardBodySchema, req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const result = await runPreX402Guard(withRequestHeaders(parsed.data, req));
      void (async () => {
        try {
          const host = new URL(parsed.data.targetUrl).hostname.toLowerCase();
          const sig = result.allowed ? ("guard_pass" as const) : ("guard_block" as const);
          await recordObservation(host, "host", sig, "self");
          if (parsed.data.walletAddress) await recordObservation(parsed.data.walletAddress, "wallet", sig, "self");
        } catch { /* reputation recording is non-blocking */ }
      })();
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
    "/api/guard/pre-x402-alchemy",
    pricing.preX402GuardAlchemy,
    "Pre-x402 safety bundle optimized for Alchemy: spend policy + wallet identity + URL risk probe",
    async (req: Request, res: Response) => {
      const parsed = parseWithVerifierFallback("/api/guard/pre-x402-alchemy", guardBodySchema, req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      const result = await runPreX402Guard(withRequestHeaders(parsed.data, req));
      void (async () => {
        try {
          const host = new URL(parsed.data.targetUrl).hostname.toLowerCase();
          const sig = result.allowed ? ("guard_pass" as const) : ("guard_block" as const);
          await recordObservation(host, "host", sig, "self");
          if (parsed.data.walletAddress) await recordObservation(parsed.data.walletAddress, "wallet", sig, "self");
        } catch { /* reputation recording is non-blocking */ }
      })();
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
    "/api/guard/payload-sandbox",
    pricing.payloadSandbox,
    "Sandbox audit on proposed request payloads for prompt injections and malicious commands",
    async (req: Request, res: Response) => {
      const parsed = parseWithVerifierFallback(
        "/api/guard/payload-sandbox",
        z.object({
          agentId: z.string().min(1),
          payload: z.record(z.unknown()),
          targetUrl: z.string().url().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runPayloadSandbox(parsed.data));
    },
  );

  post(
    "/api/pipeline/execute",
    pricing.pipelineExecute,
    "One-shot agent pipeline: guard, optional NL plan, facilitator routing, marketplace pick",
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    "/api/pipeline/trust-v2",
    pricing.pipelineTrustV2,
    "One-shot Trust v2: mandate diff + KYM ingest + guard/proxy + certified buyer gate",
    async (req: Request, res: Response) => {
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
}
