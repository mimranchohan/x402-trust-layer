import type { Request } from "express";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";
import { listEndpoints } from "../routes.js";
import { VERIFY_EXAMPLES } from "./verify-examples.js";

/** Extension key registered on every paid route (`extensions.bazaar`). */
export const BAZAAR_EXTENSION_KEY = bazaarResourceServerExtension.key;

type JsonSchema = Record<string, unknown>;

function exampleToJsonSchema(value: unknown): JsonSchema {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const items = value.length ? exampleToJsonSchema(value[0]) : { type: "object" };
    return { type: "array", items };
  }
  switch (typeof value) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      const obj = value as Record<string, unknown>;
      const properties: Record<string, JsonSchema> = {};
      for (const [k, v] of Object.entries(obj)) {
        properties[k] = exampleToJsonSchema(v);
      }
      return {
        type: "object",
        properties,
        required: Object.keys(obj),
      };
    }
    default:
      return { type: "string" };
  }
}

function declaredHttpMethod(path: string): string {
  const entry = listEndpoints().find((e) => e.path.endsWith(path));
  return entry?.path.split(" ")[0] ?? "POST";
}

export function defaultOutputExample(path: string): Record<string, unknown> {
  if (path === "/api/attestation/registry") {
    return { count: 0, records: [], policy: "Attestation registry entries" };
  }
  if (path.includes("attestation")) {
    return { ok: true, attestation: { attestationId: "att_example", allowed: true } };
  }
  if (path.includes("mpp")) {
    return {
      ok: true,
      status: "ok",
      success: true,
      action: "close",
      session: {
        sessionId: "mpp_example",
        status: "closed",
        chain: "polygon",
        agentId: "agent-mpp-usdc-test-042",
        expectedCalls: 9,
        callsUsed: 0,
        avgPricePerCallUsdc: 0.03,
      },
      settlement: {
        status: "closed",
        sessionId: "mpp_example",
        network: "eip155:137",
        chain: "polygon",
        agentId: "agent-mpp-usdc-test-042",
        callsSettled: 0,
        plannedCalls: 9,
        estimatedTotalUsdc: 0,
        facilitatorUrl: "https://x402.dexter.cash",
      },
      recommendation: "Settle aggregate USDC once on-chain via facilitator",
      facilitator: { url: "https://x402.dexter.cash", mppDocs: "https://docs.dexter.cash/docs/mpp/" },
      nextSteps: ["Facilitator settles session total to payTo wallet"],
      savingsNote: "Session closed with settlement metadata",
      confidence: 0.9,
      checks_passed: ["mpp_session", "action_close", "settlement_metadata"],
    };
  }
  if (path.includes("payment-intent")) {
    return {
      ok: true,
      status: "ok",
      withinBudget: true,
      totalEstimatedUsdc: 0.45,
      steps: [{ step: 1, path: "/api/guard/pre-x402", priceUsdc: 0.05 }],
      executionOrder: [`POST ${path}`],
    };
  }
  if (path.includes("mandate/verify")) {
    return {
      ok: true,
      allowed: true,
      valid: true,
      withinScope: true,
      reason: "Valid mandate, proposed payment within scope",
      violations: [],
      mandateId: "mdt_verifier_probe_example",
      proposed: { amountUsdc: 0.05, merchant: "api.myceliasignal.com", category: "oracle", rail: "base-x402" },
      confidence: 0.93,
      checks_passed: ["signature_ok", "scope_ok", "not_expired"],
    };
  }
  if (path.includes("buy-advisor")) {
    return {
      status: "ok",
      ok: true,
      intent: "ETH USD spot price oracle",
      checkedAt: new Date(0).toISOString(),
      recommendation: {
        action: "pay_external",
        url: "https://api.example.com/oracle/eth/usd",
        network: "eip155:8453",
        allInCostUsdc: 0.05,
        confidence: 0.85,
        rationale: "Best catalog match within policy caps",
      },
      quotes: [{ rank: 1, name: "Example API", allInCostUsdc: 0.05, requiresPayment: true }],
      policy: { evaluated: true, allowed: true, summary: "Within daily and per-call limits" },
    };
  }
  if (path.includes("audition-coach")) {
    return {
      status: "ok",
      ok: true,
      coached: true,
      allowed: true,
      hostScoreEstimate: 78,
      summary: "3 routes audited; ~78 avg score; 0 need fixes before Dexter/x402gle pass (75+).",
      discovery: { openapiOk: true, wellKnownOk: true, resourceCount: 31, openapiPathCount: 31 },
      routes: [
        {
          url: "https://x402trustlayer.xyz/api/guard/pre-x402",
          method: "POST",
          scoreEstimate: 85,
          status: "pass",
          issues: [],
          fixInstructions: [],
        },
      ],
      routeAudits: [
        {
          url: "https://x402trustlayer.xyz/api/guard/pre-x402",
          method: "POST",
          scoreEstimate: 85,
          status: "pass",
          issues: [],
          fixInstructions: [],
        },
      ],
      coaching: { hostScoreEstimate: 78, failCount: 0, passCount: 3, warnCount: 0, topFixes: [] },
      confidence: 0.88,
      checks_passed: ["openapi_checked", "well_known_checked", "routes_audited"],
    };
  }
  if (path.includes("quality-escrow")) {
    return {
      ok: true,
      action: "settle",
      escrowId: "qesc_example",
      status: "released",
      decision: "release-to-merchant",
      qualityScore: 100,
      releaseThreshold: 70,
      amountUsdc: 0.05,
      reasons: ["All required keys present"],
    };
  }
  if (path.includes("x402/proxy")) {
    return {
      status: "ok",
      ok: true,
      allowed: true,
      summary: "Proxy preflight passed — safe to pay downstream x402 endpoint",
      securityGrade: "A",
      riskScore: 12,
      targetProbe: { status: 402, requiresPayment: true, priceUsdc: 0.05 },
    };
  }
  return { ok: true, allowed: true, summary: "Paid response after x402 settlement" };
}

/** CDP Bazaar extension via official `declareDiscoveryExtension()` helper. */
export function buildBazaarExtension(
  path: string,
  method: string,
  inputExample: unknown,
): { info: Record<string, unknown>; schema: JsonSchema } {
  const outputExample = defaultOutputExample(path);
  const outputSchema = exampleToJsonSchema(outputExample);

  if (method.toUpperCase() === "GET") {
    const queryParams =
      path === "/api/attestation/registry"
        ? { minGrade: "C", limit: 20 }
        : {};
    const declared = declareDiscoveryExtension({
      queryParams,
      output: { example: outputExample, schema: outputSchema },
    } as never);
    return declared.bazaar as unknown as { info: Record<string, unknown>; schema: JsonSchema };
  }

  const body =
    inputExample && typeof inputExample === "object" ? inputExample : {};
  const declared = declareDiscoveryExtension({
    bodyType: "json",
    body,
    output: { example: outputExample, schema: outputSchema },
  } as never);
  return declared.bazaar as unknown as { info: Record<string, unknown>; schema: JsonSchema };
}

export function bazaarExtensionForRequest(req: Request): {
  info: Record<string, unknown>;
  schema: JsonSchema;
} {
  const example = VERIFY_EXAMPLES[req.path];
  const declared = declaredHttpMethod(req.path);
  /** Agentic / Bazaar crawlers probe POST routes with GET — declare GET input for probes. */
  const method =
    declared === "GET"
      ? "GET"
      : req.method === "POST"
        ? "POST"
        : "GET";
  return buildBazaarExtension(req.path, method, example);
}
