import { config } from "../config.js";
import { SUITE_VERSION } from "./version.js";
import { listEndpoints } from "../routes/catalog.js";
import { pricing } from "../config.js";
import { defaultOutputExample } from "./bazaar-extension.js";
import { ENDPOINT_META } from "./openapi-meta.js";
import { VERIFY_EXAMPLES } from "./verify-examples.js";

const X402_PROTOCOLS = [{ x402: {} }];
const MPP_SESSION_PROTOCOLS = [
  { x402: {} },
  { mpp: { method: "POST", intent: "session", currency: "0x20c000000000000000000000b9537d11c60e8b50" } },
];

const AGENT_GUIDANCE = `x402 Trust Layer — 55 paid agent payment infrastructure APIs on Base, Solana, and Polygon via Dexter facilitator.

Typical flow:
1. POST /api/guard/pre-x402 or POST /api/x402/proxy before any downstream x402 payment.
2. POST /api/merchant-trust/score for Know-Your-Merchant preflight on unknown hosts.
3. POST /api/mandate/compile for AP2-style signed intent; POST /api/mandate/diff before spend.
4. POST /api/trust-network/buyer-gate when paying certified sellers; POST /api/merchant-trust/certify to join network.
5. POST /api/quality-escrow/semantic-settle after delivery for auto-refund on bad responses.
6. POST /api/pipeline/execute for multi-step orchestration.
7. POST /api/mpp/session with action open|voucher|close for batch settlement savings.
8. POST /api/attestation/issue then pass X-Suite-Attestation on partner calls.
9. POST /api/receipt-auditor/verify after external settlements; POST /api/compliance/ledger for audit.

Pay with x402 (USDC). Unpaid GET probes return 402; send Payment-Signature on POST for full JSON responses.

Free (not in this catalog): GET /health — monitoring only, returns 200 without payment.`;

type JsonSchema = Record<string, unknown>;

function formatUsdAmount(priceStr: string): string {
  const n = Number(priceStr.replace(/^\$/, ""));
  if (!Number.isFinite(n)) return "0.010000";
  return n.toFixed(6);
}

function exampleToSchema(value: unknown): JsonSchema {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const items = value.length ? exampleToSchema(value[0]) : { type: "object" };
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
        properties[k] = exampleToSchema(v);
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

function operationId(path: string, method: string): string {
  const slug = path.replace(/^\/api\//, "").replace(/\//g, "_").replace(/-/g, "_");
  return `${method}_${slug}`;
}

function paymentProtocols(path: string): Record<string, unknown>[] {
  if (path === "/api/mpp/session" || path === "/api/mpp/session-plan") {
    return MPP_SESSION_PROTOCOLS;
  }
  return X402_PROTOCOLS;
}

function paidResponseSchema(): JsonSchema {
  return {
    type: "object",
    description: "Successful response after x402 settlement",
    properties: {
      ok: { type: "boolean" },
      allowed: { type: "boolean" },
      summary: { type: "string" },
      confidence: { type: "number" },
      checks_passed: { type: "array", items: { type: "string" } },
    },
    additionalProperties: true,
  };
}

function paid200Response(path: string): Record<string, unknown> {
  const example = defaultOutputExample(path);
  return {
    description: "Successful response after x402 settlement",
    content: {
      "application/json": {
        schema: paidResponseSchema(),
        example,
      },
    },
  };
}

function paymentRequiredResponse(): Record<string, unknown> {
  return {
    description:
      "Payment Required (x402 v2). Unpaid requests must receive HTTP 402 with Payment-Required header and non-empty accepts.",
    headers: {
      "Payment-Required": {
        description: "Base64-encoded x402 payment requirements (v2)",
        schema: { type: "string" },
      },
    },
  };
}

function buildOperation(
  path: string,
  method: string,
  priceDisplay: string,
  tier: string,
): Record<string, unknown> {
  const meta = ENDPOINT_META[path] ?? { summary: path, tags: ["x402"] };
  const priceUsd = formatUsdAmount(priceDisplay);
  const upper = method.toUpperCase();
  const example = VERIFY_EXAMPLES[path];
  const isFree = priceDisplay.toLowerCase().includes("free");

  const op: Record<string, unknown> = {
    operationId: operationId(path, method),
    summary: meta.summary,
    description: isFree
      ? `${meta.summary} — Free endpoint.`
      : `${meta.summary} — ${priceDisplay} USDC via x402 (Dexter facilitator ${config.facilitatorUrl}).`,
    tags: [tier, ...(meta.tags ?? [])],
    security: isFree ? [] : [{ x402: [] }],
    responses: {
      "200": isFree
        ? {
            description: "Successful response",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
                example: defaultOutputExample(path),
              },
            },
          }
        : paid200Response(path),
    },
  };

  if (!isFree) {
    op["x-payment-info"] = {
      price: { mode: "fixed", currency: "USD", amount: priceUsd },
      protocols: paymentProtocols(path),
    };
    (op.responses as Record<string, unknown>)["402"] = paymentRequiredResponse();
  }

  if (upper === "GET") {
    if (path === "/api/attestation/registry") {
      op.parameters = [
        { name: "minGrade", in: "query", schema: { type: "string" }, required: false },
        { name: "agentId", in: "query", schema: { type: "string" }, required: false },
        { name: "limit", in: "query", schema: { type: "integer" }, required: false },
      ];
      op.responses = {
        "200": {
          description: "Registry records after payment",
          content: {
            "application/json": {
              schema: paidResponseSchema(),
              example: defaultOutputExample(path),
            },
          },
        },
        "402": paymentRequiredResponse(),
      };
    }
  } else if (!isFree) {
    if (example && typeof example === "object") {
      op.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: exampleToSchema(example),
            example,
          },
        },
      };
    } else {
      op.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", additionalProperties: true },
          },
        },
      };
    }
  }

  return op;
}

export function buildAgentCashOpenApi(): Record<string, unknown> {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const paths: Record<string, unknown> = {};

  for (const entry of listEndpoints()) {
    const [method, route] = entry.path.split(" ");
    const m = (method ?? "POST").toLowerCase();
    if (!paths[route]) paths[route] = {};
    (paths[route] as Record<string, unknown>)[m] = buildOperation(
      route,
      m,
      entry.price,
      entry.tier,
    );
  }

  const ownershipProofs = [config.payToEvm, config.payTo].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  return {
    openapi: "3.1.0",
    components: {
      securitySchemes: {
        x402: {
          type: "apiKey",
          in: "header",
          name: "Payment-Signature",
          description: "x402 v2 payment payload (base64)",
        },
      },
    },
    info: {
      title: "x402 Trust Layer",
      version: SUITE_VERSION,
      description:
        "55 paid x402 trust infrastructure APIs: guard, semantic escrow, mandate diff, certified seller network, KYM, mandates, compliance, disputes, and orchestration.",
      "x-guidance": AGENT_GUIDANCE,
    },
    "x-discovery": {
      ownershipProofs,
      publicEndpoints: [`${base}/health`, `${base}/.well-known/x402`],
      freeEndpoints: [
        { path: "/health", method: "GET", purpose: "Monitoring — not in OpenAPI paths" },
        {
          path: "/.well-known/x402",
          method: "GET",
          purpose: "Paid URL catalog — register /api/* from resources[]",
        },
      ],
    },
    "x-x402scan": {
      discoveryMode: "openapi-first",
      paidRouteCount: listEndpoints().length,
      note: `OpenAPI lists ${listEndpoints().length} paid /api/* operations. Free routes documented under x-discovery.freeEndpoints.`,
    },
    servers: [{ url: config.publicBaseUrl }],
    paths,
  };
}

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function priceToMicro(priceStr: string): string {
  const n = Number(priceStr.replace(/^\$/, ""));
  if (!Number.isFinite(n) || n <= 0) return "10000";
  return String(Math.round(n * 1_000_000));
}

function endpointAccepts(priceLabel: string): Record<string, unknown> {
  const payTo = config.payToEvm || config.payTo;
  return {
    scheme: "exact",
    network: "eip155:8453",
    asset: { address: BASE_USDC, decimals: 6 },
    maxAmountRequired: priceToMicro(priceLabel),
    payTo,
    extra: { name: "USDC on Base" },
  };
}

/** AgentCash / x402scan 2026 spec v2 — per-resource accepts with micro-units. */
export function buildWellKnownX402V2(): Record<string, unknown> {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const resources = listEndpoints()
    .filter((e) => e.path.startsWith("POST "))
    .map((e) => {
      const [, route] = e.path.split(" ");
      return {
        url: `${base}${route}`,
        method: "POST",
        description: `${route} — ${e.tier} tier trust API`,
        accepts: [endpointAccepts(e.price)],
        tags: ["x402", "trust", e.tier],
        "x-agent-hint": "Call before any external x402 payment when using guard or proxy flows",
      };
    });

  return {
    x402Version: 2,
    protocolVersion: "2.14.0",
    resources,
    capabilities: ["guard", "mandate", "escrow", "attestation", "receipt-audit"],
    pricing: {
      preX402Guard: pricing.preX402Guard,
      x402Proxy: pricing.x402Proxy,
    },
  };
}

/** x402scan / AgentCash compatibility fan-out */
export function buildWellKnownX402Resources(): Record<string, unknown> {
  const ownershipProofs = [config.payToEvm, config.payTo].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const resources = listEndpoints().map((e) => {
    const [, route] = e.path.split(" ");
    return `${base}${route}`;
  });
  return {
    x402Version: 2,
    protocolVersion: "2.14.0",
    version: 1,
    resources,
    ownershipProofs,
    instructions:
      "Free catalog endpoint (HTTP 200). Register paid resource URLs from resources[] — not this URL. Paid routes: POST with Payment-Signature; GET /api/* returns 402 when unpaid.",
    v2: `${base}/.well-known/x402/v2`,
  };
}
