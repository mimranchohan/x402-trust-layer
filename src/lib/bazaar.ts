import { config } from "../config.js";
import { listEndpoints } from "../routes.js";
import { SUITE_VERSION } from "./version.js";

const SERVICE_NAME = "x402 Agent Suite Pro";
const SERVICE_DESCRIPTION =
  "Paid x402 infrastructure for AI agent fleets: preflight guard, proxy, MPP sessions, attestations, spend policy, and pipeline orchestration.";

const ENDPOINT_META: Record<string, { summary: string; category: string; tags: string[] }> = {
  "/api/x402/proxy": {
    summary: "One-call preflight: guard + security grade + attestation + probe",
    category: "Infrastructure",
    tags: ["x402", "proxy", "preflight", "guard"],
  },
  "/api/mpp/session": {
    summary: "MPP session open, voucher, and close for batch settlement savings",
    category: "Infrastructure",
    tags: ["mpp", "batch", "solana"],
  },
  "/api/attestation/issue": {
    summary: "Issue signed preflight attestation for trust networks",
    category: "Trust",
    tags: ["attestation", "trust", "security"],
  },
  "/api/attestation/verify": {
    summary: "Verify attestation signature before downstream payment",
    category: "Trust",
    tags: ["attestation", "verify"],
  },
  "/api/attestation/registry": {
    summary: "Query active attestations registry",
    category: "Trust",
    tags: ["attestation", "registry"],
  },
  "/api/guard/pre-x402": {
    summary: "Spend + identity + risk + security grade before any x402 pay",
    category: "Infrastructure",
    tags: ["guard", "preflight", "policy"],
  },
  "/api/pipeline/execute": {
    summary: "Full agent pipeline: guard, plan, facilitator, routing in one call",
    category: "Orchestration",
    tags: ["pipeline", "orchestration"],
  },
  "/api/payment-intent/compile": {
    summary: "Compile multi-step x402 execution plan from natural language",
    category: "Orchestration",
    tags: ["plan", "compiler"],
  },
  "/api/facilitator/failover": {
    summary: "Rank facilitators and recommend failover path",
    category: "Infrastructure",
    tags: ["facilitator", "failover"],
  },
  "/api/mpp/session-plan": {
    summary: "Estimate MPP session vs per-call settlement savings",
    category: "Infrastructure",
    tags: ["mpp", "estimate"],
  },
  "/api/spend-governor/check": {
    summary: "Enforce agent daily and per-call spend caps",
    category: "Policy",
    tags: ["spend", "budget", "policy"],
  },
  "/api/identity-gate/check": {
    summary: "Wallet identity tier and risk scoring",
    category: "Policy",
    tags: ["identity", "wallet", "kyc"],
  },
  "/api/risk-gate/scan": {
    summary: "Probe URL security, HTTPS, and x402 payment requirements",
    category: "Security",
    tags: ["risk", "scan", "security"],
  },
  "/api/router/route": {
    summary: "Route capability query to best x402 API (suite-first)",
    category: "Discovery",
    tags: ["router", "marketplace"],
  },
  "/api/research/brief": {
    summary: "Research pipeline plan and cost estimate",
    category: "Research",
    tags: ["research", "brief"],
  },
  "/api/receipt-auditor/verify": {
    summary: "Verify x402 settlement receipt on-chain",
    category: "Audit",
    tags: ["receipt", "audit", "settlement"],
  },
  "/api/refund-arbiter/evaluate": {
    summary: "Evaluate refund eligibility from verification signals",
    category: "Trust",
    tags: ["refund", "arbiter"],
  },
  "/api/budget-allocator/run": {
    summary: "Allocate shared USDC pool across agent fleet",
    category: "Enterprise",
    tags: ["budget", "fleet"],
  },
  "/api/settlement-graph/next": {
    summary: "Recommend next paid APIs after a settlement",
    category: "Intelligence",
    tags: ["graph", "recommendations"],
  },
  "/api/quality-monitor/probe": {
    summary: "Regression probe up to 10 x402 endpoints",
    category: "Quality",
    tags: ["monitor", "quality"],
  },
  "/api/evidence-locker/export": {
    summary: "Export compliance audit bundle for settlements",
    category: "Enterprise",
    tags: ["compliance", "audit"],
  },
  "/api/agent-escrow": {
    summary: "Create, status, or release agent-to-agent USDC escrow",
    category: "Enterprise",
    tags: ["escrow", "agents"],
  },
};

function parseEndpointEntry(entry: { path: string; price: string }): {
  method: string;
  path: string;
  priceUsdc: number;
} {
  const [method, route] = entry.path.split(" ");
  const priceUsdc = Number(entry.price.replace(/^\$/, "")) || 0;
  return { method: method ?? "POST", path: route ?? entry.path, priceUsdc };
}

export function buildBazaarRoutes() {
  return listEndpoints().map((entry) => {
    const { method, path, priceUsdc } = parseEndpointEntry(entry);
    const meta = ENDPOINT_META[path] ?? {
      summary: entry.path,
      category: "Infrastructure",
      tags: ["x402"],
    };
    const resource = `${config.publicBaseUrl}${path}`;
    return {
      resource,
      method,
      path,
      priceUsdc,
      priceDisplay: entry.price,
      tier: entry.tier,
      summary: meta.summary,
      category: meta.category,
      tags: meta.tags,
      networks: config.networks,
      payTo: config.payTo,
      facilitatorUrl: config.facilitatorUrl,
      extensions: {
        bazaar: {
          discoverable: true,
          category: meta.category,
          tags: meta.tags,
        },
      },
    };
  });
}

export function buildServicesManifest() {
  return {
    x402Version: 2,
    name: SERVICE_NAME,
    description: SERVICE_DESCRIPTION,
    baseUrl: config.publicBaseUrl,
    facilitatorUrl: config.facilitatorUrl,
    payTo: config.payTo,
    networks: config.networks,
    openapi: `${config.publicBaseUrl}/openapi.json`,
    discover: `${config.publicBaseUrl}/x402/api/discover`,
    routes: buildBazaarRoutes(),
    updatedAt: new Date().toISOString(),
  };
}

export function buildWellKnownX402() {
  return {
    name: SERVICE_NAME,
    version: SUITE_VERSION,
    description: SERVICE_DESCRIPTION,
    baseUrl: config.publicBaseUrl,
    facilitator: config.facilitatorUrl,
    payTo: config.payTo,
    networks: config.networks,
    discovery: {
      services: `${config.publicBaseUrl}/x402/api/services.json`,
      discover: `${config.publicBaseUrl}/x402/api/discover`,
      openapi: `${config.publicBaseUrl}/openapi.json`,
    },
    agenticMarket: {
      validateUrl: "https://agentic.market/",
      note: "Use Validate Endpoint per resource URL; settlements via CDP facilitator index faster on Agentic Market",
    },
  };
}

export function buildDiscoverCatalog() {
  const routes = buildBazaarRoutes();
  return {
    service: SERVICE_NAME,
    version: SUITE_VERSION,
    endpointCount: routes.length,
    resources: routes.map((r) => ({
      url: r.resource,
      method: r.method,
      description: r.summary,
      priceUsdc: r.priceUsdc,
      category: r.category,
      tags: r.tags,
      accepts: r.networks.map((network) => ({
        scheme: "exact",
        network,
        payTo: config.payTo,
        amountUsdc: r.priceUsdc,
      })),
      extensions: r.extensions,
    })),
  };
}
