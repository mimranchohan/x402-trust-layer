import type { Request, Response } from "express";
import { z } from "zod";
import { runSpendGovernor } from "../agents/spend-governor.js";
import { runIdentityGate } from "../agents/identity-gate.js";
import { runRiskGate } from "../agents/risk-gate.js";
import { runPaymentIntentCompiler } from "../agents/payment-intent-compiler.js";
import { runMppSessionBroker } from "../agents/mpp-session-broker.js";
import { aggregateMultiChainTrust, type SupportedChain } from "../agents/multichain-trust.js";
import { getReputationHistory, getLatestReputation } from "../lib/reputation-store.js";
import { pricing } from "../config.js";
import { parseWithVerifierFallback } from "../lib/parse-with-verifier-fallback.js";
import { policySchema } from "./schemas.js";
import { createPost, type RouteContext } from "./shared.js";

export function registerCoreAgentRoutes(ctx: RouteContext) {
  const post = createPost(ctx);

  post(
    "/api/spend-governor/check",
    pricing.spendGovernor,
    "Evaluate proposed agent spend against daily and per-call USDC caps and host allowlists",
    async (req: Request, res: Response) => {
      const parsed = parseWithVerifierFallback(
        "/api/spend-governor/check",
        z.object({
          agentId: z.string().min(1),
          estimatedCostUsdc: z.coerce.number().nonnegative(),
          targetUrl: z.string().url().optional(),
          network: z.string().optional(),
          policy: policySchema,
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runSpendGovernor(parsed.data));
    },
  );

  post(
    "/api/identity-gate/check",
    pricing.identityGate,
    "Check wallet identity tier, ERC-8004 TrustScore, and spend ceiling before payment",
    async (req: Request, res: Response) => {
      const parsed = parseWithVerifierFallback(
        "/api/identity-gate/check",
        z.object({
          walletAddress: z.string().min(16),
          maxTierSpendUsdc: z.coerce.number().positive().optional(),
          requireMainnet: z.coerce.boolean().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runIdentityGate(parsed.data));
    },
  );

  post(
    "/api/risk-gate/scan",
    pricing.riskGate,
    "Probe target URL for HTTPS, x402 payment requirements, and risk blockers",
    async (req: Request, res: Response) => {
      const parsed = parseWithVerifierFallback(
        "/api/risk-gate/scan",
        z.object({
          targetUrl: z.string().url(),
          estimatedCostUsdc: z.coerce.number().nonnegative().optional(),
          fastProbe: z.coerce.boolean().optional(),
          policy: z
            .object({
              perCallCapUsdc: z.coerce.number().positive().optional(),
              blockedHosts: z.array(z.string()).optional(),
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
    "/api/payment-intent/compile",
    pricing.paymentCompiler,
    "Compile multi-step x402 execution plan from natural language with USDC budget validation",
    async (req: Request, res: Response) => {
      const parsed = parseWithVerifierFallback(
        "/api/payment-intent/compile",
        z.object({
          task: z.string().min(1),
          maxBudgetUsdc: z.coerce.number().positive(),
          agentId: z.string().min(1),
          includeResearch: z.coerce.boolean().optional(),
          externalCallEstimateUsdc: z.coerce.number().nonnegative().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runPaymentIntentCompiler(parsed.data));
    },
  );

  post(
    "/api/mpp/session-plan",
    pricing.mppBroker,
    "Estimate MPP session cost versus per-call settlement and recommend batch vs per-call",
    async (req: Request, res: Response) => {
      const parsed = parseWithVerifierFallback(
        "/api/mpp/session-plan",
        z.object({
          action: z.enum(["estimate", "plan"]).optional(),
          expectedCalls: z.coerce.number().int().positive().optional(),
          avgPricePerCallUsdc: z.coerce.number().positive().optional(),
          network: z.string().optional(),
          objective: z.string().optional(),
          topic: z.string().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(runMppSessionBroker(parsed.data));
    },
  );

  // -----------------------------------------------------------------------
  // Multi-chain trust aggregation
  // -----------------------------------------------------------------------

  ctx.app.get(
    "/api/agent/multichain-trust",
    async (req: Request, res: Response): Promise<void> => {
      const wallet = typeof req.query.wallet === "string" ? req.query.wallet.trim() : "";
      if (!wallet) {
        res.status(400).json({ error: "wallet query parameter required (EVM address)" });
        return;
      }

      const skipCache = req.query.skipCache === "true" || req.query.skipCache === "1";

      // Optional chain filter: ?chains=base,ethereum
      const chainsRaw = typeof req.query.chains === "string" ? req.query.chains : "";
      const VALID: SupportedChain[] = ["base", "ethereum", "polygon", "arbitrum"];
      const chains: SupportedChain[] | undefined = chainsRaw
        ? (chainsRaw
            .split(",")
            .map((c) => c.trim().toLowerCase())
            .filter((c): c is SupportedChain => VALID.includes(c as SupportedChain)) as SupportedChain[])
        : undefined;

      if (chainsRaw && (!chains || chains.length === 0)) {
        res.status(400).json({
          error: `Invalid chains filter. Supported: ${VALID.join(", ")}`,
        });
        return;
      }

      const result = await aggregateMultiChainTrust(wallet, { skipCache, chains });
      res.json({ ok: true, ...result });
    },
  );

  // -----------------------------------------------------------------------
  // Agent Reputation History  GET /api/agent/:walletAddress/history
  // -----------------------------------------------------------------------

  ctx.app.get(
    "/api/agent/:walletAddress/history",
    (req: Request, res: Response): void => {
      const { walletAddress } = req.params;
      if (!walletAddress || walletAddress.trim().length < 16) {
        res.status(400).json({ error: "Invalid walletAddress" });
        return;
      }

      const limit = Math.min(
        Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 50,
        200,
      );
      const offset = Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : 0;
      const chain = typeof req.query.chain === "string" ? req.query.chain.trim() || undefined : undefined;

      const { entries, total } = getReputationHistory(walletAddress, { limit, offset, chain });
      const latest = getLatestReputation(walletAddress);

      res.json({
        ok: true,
        walletAddress: walletAddress.trim().toLowerCase(),
        total,
        limit,
        offset,
        latestTier: latest?.tier ?? null,
        latestScore: latest?.trustScore ?? null,
        history: entries,
      });
    },
  );
}
