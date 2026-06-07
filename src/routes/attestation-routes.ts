import type { Request, Response } from "express";
import { z } from "zod";
import { runAttestationIssue, runAttestationVerify, runTrustRegistryQuery } from "../agents/attestation-registry.js";
import { runMerchantTrust } from "../agents/merchant-trust.js";
import { runMandateCompile } from "../agents/mandate-compiler.js";
import { runMandateDiff } from "../agents/mandate-diff.js";
import { runSellerCertify, runBuyerGate, runBondSlash } from "../agents/trust-network.js";
import { runTransactionAuth } from "../agents/transaction-auth.js";
import { runInsuranceAttest } from "../agents/insurance-attest.js";
import { config, pricing } from "../config.js";
import { createPost, createGet, withRequestHeaders, type RouteContext } from "./shared.js";
import { guardBodySchema } from "./schemas.js";
import { parseWithVerifierFallback } from "../lib/parse-with-verifier-fallback.js";

export function registerAttestationRoutes(ctx: RouteContext) {
  const post = createPost(ctx);
  const get = createGet(ctx);

  post(
    "/api/attestation/issue",
    pricing.attestationIssue,
    "Issue signed preflight attestation for partner agent trust networks",
    async (req: Request, res: Response) => {
      const parsed = guardBodySchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runAttestationIssue(parsed.data));
    },
  );

  post(
    "/api/attestation/verify",
    pricing.attestationVerify,
    "Verify attestation signature and expiry before downstream payment",
    async (req: Request, res: Response) => {
      const parsed = z.object({ attestationId: z.string().min(8) }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runAttestationVerify(parsed.data.attestationId));
    },
  );

  get(
    "/api/attestation/registry",
    pricing.trustRegistry,
    "Query trust registry of valid attestations for agent fleets",
    async (req: Request, res: Response) => {
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
    "/api/merchant-trust/score",
    pricing.merchantTrust,
    "Know-Your-Merchant trust + wash-trading score before paying an x402 host",
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    "/api/mandate/diff",
    pricing.mandateDiff,
    "Compare signed mandate scope to MCP tool trace before x402 payment",
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    "/api/trust-network/transaction-auth",
    pricing.transactionAuth,
    "Certified seller transaction authorization pre-flight validation",
    async (req: Request, res: Response) => {
      const parsed = parseWithVerifierFallback(
        "/api/trust-network/transaction-auth",
        z.object({
          buyerWallet: z.string().min(16),
          sellerHost: z.string().min(1),
          amountUsdc: z.coerce.number().positive(),
          agentId: z.string().optional(),
          attestationId: z.string().optional(),
          network: z.string().optional(),
          requestHeaders: z.record(z.unknown()).optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runTransactionAuth(parsed.data));
    },
  );

  post(
    "/api/trust-network/insurance/attest",
    pricing.insuranceAttest,
    "Cryptographically sign transaction liability insurance based on active merchant bonds",
    async (req: Request, res: Response) => {
      const parsed = parseWithVerifierFallback(
        "/api/trust-network/insurance/attest",
        z.object({
          buyerWallet: z.string().min(16),
          sellerHost: z.string().min(1),
          amountUsdc: z.coerce.number().positive(),
          agentId: z.string().optional(),
        }),
        req.body,
      );
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await runInsuranceAttest(parsed.data));
    },
  );

  post(
    "/api/trust-network/bond/slash",
    pricing.bondSlash,
    "Slash certified seller virtual bond after failed semantic delivery",
    async (req: Request, res: Response) => {
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
}
