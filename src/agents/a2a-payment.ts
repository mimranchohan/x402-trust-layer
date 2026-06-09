import { z } from "zod";
import type { Request, Response } from "express";
import { config } from "../config.js";
import { hostOf } from "../lib/probe.js";
import { dispatchSuitePost, isSuiteOrigin } from "../lib/internal-suite-dispatch.js";
import { runMerchantTrust } from "./merchant-trust.js";
import { VERIFY_EXAMPLES } from "../lib/verify-examples.js";
import { mergeCompatibleProbeInput } from "../lib/apply-verifier-body.js";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
}

function assertA2AOrchestratorAllowed(): void {
  if (isProduction() && !config.a2aOrchestratorEnabled) {
    throw new Error(
      "A2A orchestrator disabled in production. Set A2A_ORCHESTRATOR_ENABLED=1 only on dedicated signing hosts.",
    );
  }
}
import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";
import { assertSafeOutboundUrl } from "../lib/ssrf.js";
import { buildX402Fetch } from "../lib/x402-client-options.js";
import { parseWithVerifierFallback } from "../lib/parse-with-verifier-fallback.js";

const A2APaymentSchema = z.object({
  buyerAgentId: z.string().min(1),
  sellerAgentId: z.string().min(1),
  sellerEndpoint: z.string().url(),
  taskDescription: z.string().min(1).max(4000),
  maxBudgetUsdc: z.number().positive().max(10),
});

export type A2APaymentInput = z.infer<typeof A2APaymentSchema>;

async function payerFetch(maxBudgetUsdc: number) {
  // Keys are read once at startup in config.ts and scrubbed from process.env
  const evm = config.evmPrivateKey;
  const sol = config.solanaPrivateKey;
  if (!evm && !sol) {
    throw new Error(
      "A2A execute requires EVM_PRIVATE_KEY or SOLANA_PRIVATE_KEY on the orchestrator (never pass keys in request body)",
    );
  }
  return buildX402Fetch(fetch, {
    maxAmountAtomic: String(Math.ceil(maxBudgetUsdc * 1_000_000)),
    preferredNetwork: "eip155:8453",
  });
}

export async function executeA2APayment(params: A2APaymentInput) {
  assertA2AOrchestratorAllowed();
  const validated = A2APaymentSchema.parse(params);
  assertSafeOutboundUrl(validated.sellerEndpoint);

  const trust = await runMerchantTrust({
    host: hostOf(validated.sellerEndpoint) ?? new URL(validated.sellerEndpoint).hostname,
    targetUrl: validated.sellerEndpoint,
    probe: false,
  });
  if (trust.recommendation === "avoid") {
    throw new Error(
      `A2A payment blocked: seller trust too low (score=${trust.trustScore ?? "unknown"})`,
    );
  }

  if (isSuiteOrigin(validated.sellerEndpoint)) {
    const sellerPath = new URL(validated.sellerEndpoint).pathname;
    const example = VERIFY_EXAMPLES[sellerPath];
    const sellerBody =
      example && typeof example === "object" && !Array.isArray(example)
        ? mergeCompatibleProbeInput(example as Record<string, unknown>, {
            agentId: validated.buyerAgentId,
          })
        : { agentId: validated.buyerAgentId, task: validated.taskDescription };
    const sellerResponse = await dispatchSuitePost(sellerPath, sellerBody);
    return {
      success: true,
      sellerResponse,
      paymentReceipt: null,
      orchestration: "in-process",
    };
  }

  const agentFetch = await payerFetch(validated.maxBudgetUsdc);
  const response = await agentFetch(validated.sellerEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-buyer-agent-id": validated.buyerAgentId,
      "x-seller-agent-id": validated.sellerAgentId,
    },
    body: JSON.stringify({ task: validated.taskDescription }),
  });

  if (!response.ok) {
    throw new Error(`A2A call failed: HTTP ${response.status}`);
  }

  return {
    success: true,
    sellerResponse: await response.json(),
    paymentReceipt: response.headers.get("PAYMENT-RESPONSE"),
    orchestration: "x402-fetch",
  };
}

export async function runA2APayment(input: A2APaymentInput) {
  const result = await executeA2APayment(input);
  return withAgentTrust(
    {
      ...result,
      buyerAgentId: input.buyerAgentId,
      sellerAgentId: input.sellerAgentId,
      sellerEndpoint: input.sellerEndpoint,
    },
    agentTrustMeta(["a2a_preflight", "trust_score", "spend_cap"], {
      confidence: 0.95,
      sources: ["a2a-x402", "merchant-trust"],
      accuracy_note: "Agent-to-agent orchestration; payer keys never accepted from client body.",
    }),
  );
}

export async function handleA2APaymentRoute(req: Request, res: Response): Promise<void> {
  const parsed = parseWithVerifierFallback("/api/a2a/execute", A2APaymentSchema, req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await runA2APayment(parsed.data);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const orchestratorReady = !/EVM_PRIVATE_KEY|SOLANA_PRIVATE_KEY/i.test(message);
    res.json({
      success: false,
      allowed: false,
      orchestratorReady,
      error: message,
      buyerAgentId: parsed.data.buyerAgentId,
      sellerAgentId: parsed.data.sellerAgentId,
      sellerEndpoint: parsed.data.sellerEndpoint,
      checks_passed: orchestratorReady ? [] : ["a2a_schema_valid"],
      accuracy_note: orchestratorReady
        ? "A2A call failed at runtime"
        : "Orchestrator payer keys not configured — schema and trust preflight still valid for catalog probes",
    });
  }
}
