import type { Request, Response } from "express";
import { z } from "zod";
import { runComplianceLedger } from "../agents/compliance-ledger.js";
import { runDisputeResolve } from "../agents/dispute-resolver.js";
import { runRefundArbiter } from "../agents/refund-arbiter.js";
import { pricing } from "../config.js";
import { createPost, type RouteContext } from "./shared.js";
import { verifierFallback } from "./schemas.js";

export function registerComplianceRoutes(ctx: RouteContext) {
  const post = createPost(ctx);

  post(
    "/api/compliance/ledger",
    pricing.complianceLedger,
    "Reconcile agent spend into a CFO/SOC2-grade audit ledger with policy flags",
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    "/api/refund-arbiter/evaluate",
    pricing.refundArbiter,
    "Evaluate buyer refund eligibility from verification signals",
    async (req: Request, res: Response) => {
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
}
