import type { Request, Response } from "express";
import { z } from "zod";
import { runRailOptimizer } from "../agents/rail-optimizer.js";
import { runReceiptAuditor } from "../agents/receipt-auditor.js";
import { runQualityEscrow } from "../agents/quality-escrow.js";
import { runSemanticQualityEscrow } from "../agents/quality-escrow-semantic.js";
import { openMeteredSession, chargeMeteredSession, closeMeteredSession } from "../agents/metered-escrow.js";
import { pricing } from "../config.js";
import { createPost, type RouteContext } from "./shared.js";
import { verifierFallback } from "./schemas.js";
import { parseWithVerifierFallback } from "../lib/parse-with-verifier-fallback.js";

export function registerSettlementRoutes(ctx: RouteContext) {
  const post = createPost(ctx);

  post(
    "/api/rail-optimizer/route",
    pricing.railOptimizer,
    "Pick the best settlement rail across Visa CLI, Stripe MPP, Circle, Base, Solana",
    async (req: Request, res: Response) => {
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
    "/api/receipt-auditor/verify",
    pricing.receiptAuditor,
    "Verify x402 settlement receipts and on-chain transaction alignment",
    async (req: Request, res: Response) => {
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
    "/api/quality-escrow/settle",
    pricing.qualityEscrow,
    "Quality-gated escrow: verify response vs profile, release to merchant or auto-refund",
    async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
    "/api/escrow/metered/open",
    pricing.escrowOpen,
    "Open a usage-based pay-as-you-go escrow session budget",
    async (req: Request, res: Response) => {
      const parsed = z.object({
        buyerWallet: z.string().min(16),
        sellerHost: z.string().min(1),
        budgetUsdc: z.coerce.number().positive(),
      }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await openMeteredSession(parsed.data.buyerWallet, parsed.data.sellerHost, parsed.data.budgetUsdc));
    }
  );

  post(
    "/api/escrow/metered/charge",
    pricing.escrowCharge,
    "Charge against a running usage-based escrow session budget",
    async (req: Request, res: Response) => {
      const parsed = z.object({
        sessionId: z.string().min(8),
        amountUsdc: z.coerce.number().positive(),
      }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await chargeMeteredSession(parsed.data.sessionId, parsed.data.amountUsdc));
    }
  );

  post(
    "/api/escrow/metered/close",
    pricing.escrowClose,
    "Close a usage-based escrow session and settle final spent amounts",
    async (req: Request, res: Response) => {
      const parsed = z.object({
        sessionId: z.string().min(8),
      }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
      res.json(await closeMeteredSession(parsed.data.sessionId));
    }
  );
}
