import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response, type NextFunction } from "express";
import { x402Middleware } from "@dexterai/x402/server";
import { z } from "zod";
import { runApiRouter } from "./agents/api-router.js";
import { runReceiptAuditor } from "./agents/receipt-auditor.js";
import { runResearchBrief } from "./agents/research-brief.js";
import { runRiskGate } from "./agents/risk-gate.js";
import { runSpendGovernor } from "./agents/spend-governor.js";
import { assertConfig, config, pricing } from "./config.js";

assertConfig();

const app = express();
app.use(express.json({ limit: "256kb" }));

const networks =
  config.network === "base"
    ? (["eip155:8453"] as const)
    : (["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"] as const);

const baseMiddleware = {
  payTo: config.payTo,
  facilitatorUrl: config.facilitatorUrl,
  network: [...networks],
  onSettlement: (info: { transaction?: string; payer?: string; network?: string }) => {
    console.log(`[x402] settled tx=${info.transaction} payer=${info.payer} network=${info.network}`);
  },
};

function paid(amount: string) {
  return x402Middleware({ ...baseMiddleware, amount });
}

/** Prevent async route throws from killing the whole process */
function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "x402-agent-suite", network: config.network });
});

const rootDir = path.dirname(fileURLToPath(import.meta.url));
app.get("/openapi.json", (_req, res) => {
  const spec = readFileSync(path.join(rootDir, "..", "openapi.json"), "utf8");
  res.type("application/json").send(spec);
});

app.get("/", (_req, res) => {
  res.json({
    name: "x402 Agent Suite",
    docs: `${config.publicBaseUrl}/openapi.json`,
    endpoints: [
      { path: "POST /api/spend-governor/check", price: `$${pricing.spendGovernor}` },
      { path: "POST /api/receipt-auditor/verify", price: `$${pricing.receiptAuditor}` },
      { path: "POST /api/risk-gate/scan", price: `$${pricing.riskGate}` },
      { path: "POST /api/router/route", price: `$${pricing.apiRouter}` },
      { path: "POST /api/research/brief", price: `$${pricing.researchBrief}` },
    ],
  });
});

const policySchema = z.object({
  dailyCapUsdc: z.number().positive(),
  perCallCapUsdc: z.number().positive(),
  allowedHosts: z.array(z.string()).optional(),
  blockedHosts: z.array(z.string()).optional(),
  allowedNetworks: z.array(z.string()).optional(),
});

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

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    res.json(await runSpendGovernor(parsed.data));
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

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    res.json(await runReceiptAuditor(parsed.data));
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

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

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

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

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

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    res.json(await runResearchBrief(parsed.data));
  }),
);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[api error]", err);
  res.status(500).json({
    error: err instanceof Error ? err.message : "Internal server error",
  });
});

const host = "0.0.0.0";
app.listen(config.port, host, () => {
  console.log(`x402 Agent Suite listening on http://127.0.0.1:${config.port}`);
  console.log(`payTo=${config.payTo} network=${config.network} facilitator=${config.facilitatorUrl}`);
  console.log("Keep this terminal open. Press Ctrl+C to stop.");
});

process.on("uncaughtException", (err) => {
  console.error("[fatal]", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});
