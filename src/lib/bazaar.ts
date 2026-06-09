import { config } from "../config.js";
import { listEndpoints } from "../routes.js";
import { SUITE_VERSION } from "./version.js";

const SERVICE_NAME = "x402 Trust Layer";
const SERVICE_DESCRIPTION =
  "55 paid x402 trust infrastructure APIs: guard, semantic escrow, mandate diff, certified sellers, ERC-8004, plus Agent Trust Protocol v4 (passport, trust v2, fraud, oracle, PoE, escrow FSM, replay, zk, credit bureau).";

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
  "/api/agent/verify": {
    summary: "ERC-8004 TrustScore on Base mainnet — agent identity and reputation",
    category: "Trust",
    tags: ["erc-8004", "identity", "trust-score", "agent"],
  },
  "/api/pipeline/execute": {
    summary: "Full agent pipeline: guard, plan, facilitator, routing in one call",
    category: "Orchestration",
    tags: ["pipeline", "orchestration"],
  },
  "/api/facilitator/failover": {
    summary: "Rank facilitators and recommend failover path",
    category: "Infrastructure",
    tags: ["facilitator", "failover"],
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
  "/api/market/buy-advisor": {
    summary: "x402 buy quote: rank paid APIs, policy, chain, MPP before you pay",
    category: "Discovery",
    tags: ["marketplace", "quote", "discovery"],
  },
  "/api/seller/audition-coach": {
    summary: "Seller audition coach: OpenAPI, 402 probes, x402gle fixes before ingest",
    category: "Quality",
    tags: ["seller", "audition", "discovery", "quality"],
  },
  "/api/merchant-trust/score": {
    summary: "Know-Your-Merchant trust + wash-trading score before payment",
    category: "Trust",
    tags: ["trust", "kym", "wash-trade", "preflight"],
  },
  "/api/mandate/compile": {
    summary: "Compile signed AP2-style payment mandate from human intent",
    category: "Trust",
    tags: ["mandate", "ap2", "intent", "governance"],
  },
  "/api/rail-optimizer/route": {
    summary: "Choose best rail: Visa CLI, Stripe MPP, Circle, Base, Solana",
    category: "Infrastructure",
    tags: ["rail", "router", "visa-cli", "mpp"],
  },
  "/api/compliance/ledger": {
    summary: "CFO/SOC2-grade spend reconciliation with tamper-evident hash",
    category: "Enterprise",
    tags: ["compliance", "audit", "cfo", "ledger"],
  },
  "/api/dispute/resolve": {
    summary: "Visa chargeback dossier or on-chain refund claim builder",
    category: "Trust",
    tags: ["dispute", "chargeback", "visa", "refund"],
  },
  "/api/quality-escrow/settle": {
    summary: "Quality-gated escrow with response verification and auto-refund",
    category: "Trust",
    tags: ["escrow", "quality", "refund", "trust"],
  },
  "/api/quality-escrow/semantic-settle": {
    summary: "Semantic delivery escrow: intent rubric + schema match before release/refund",
    category: "Trust",
    tags: ["escrow", "semantic", "delivery", "trust"],
  },
  "/api/mandate/diff": {
    summary: "Intent diff: mandate scope vs MCP tool trace before payment",
    category: "Trust",
    tags: ["mandate", "intent", "diff", "governance"],
  },
  "/api/merchant-trust/certify": {
    summary: "Certify x402 seller with badge and buyer access policy",
    category: "Trust",
    tags: ["certification", "seller", "kym", "trust-network"],
  },
  "/api/trust-network/buyer-gate": {
    summary: "Buyer gate for certified sellers: attestation + tier check",
    category: "Trust",
    tags: ["trust-network", "attestation", "buyer", "gate"],
  },
  "/api/pipeline/trust-v2": {
    summary: "One-shot: mandate diff + KYM ingest + guard + certified buyer gate",
    category: "Orchestration",
    tags: ["pipeline", "trust-v2", "orchestration"],
  },
  "/api/trust-network/bond/slash": {
    summary: "Slash certified seller virtual bond after failed delivery",
    category: "Trust",
    tags: ["bond", "slash", "seller", "trust-network"],
  },
  "/api/protocol/pipeline/full-trust": {
    summary: "Full Agent Trust Protocol v4 pipeline before x402 payment",
    category: "Protocol",
    tags: ["protocol", "trust", "pipeline"],
  },
  "/api/protocol/passport/issue": {
    summary: "Issue Agent Passport DID verifiable credential",
    category: "Protocol",
    tags: ["did", "identity", "passport"],
  },
  "/api/protocol/trust-score/v2": {
    summary: "Tamper-resistant TrustScore v2 with HMAC proof",
    category: "Protocol",
    tags: ["trust-score", "erc8004"],
  },
  "/api/protocol/fraud/scan": {
    summary: "Graph fraud scan: Sybil, wash trading, circular payments",
    category: "Protocol",
    tags: ["fraud", "risk"],
  },
  "/api/protocol/execution/issue": {
    summary: "Proof of Execution receipt with tool and settlement proofs",
    category: "Protocol",
    tags: ["poe", "receipt", "audit"],
  },
  "/api/protocol/replay/bind": {
    summary: "Replay-safe binding: nonce + resource hash + request hash",
    category: "Protocol",
    tags: ["replay", "security"],
  },
  "/api/protocol/credit/score": {
    summary: "AI Agent Credit Bureau score 300-900",
    category: "Protocol",
    tags: ["credit", "bureau"],
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
  const payToMap: Record<string, string> = {};
  for (const network of config.networks) {
    if (network.startsWith("solana:")) payToMap[network] = config.payTo;
    else payToMap[network] = config.payToEvm || config.payTo;
  }
  return {
    x402Version: 2,
    name: SERVICE_NAME,
    version: SUITE_VERSION,
    description: SERVICE_DESCRIPTION,
    baseUrl: config.publicBaseUrl,
    paymentRequired: true,
    facilitator: config.facilitatorUrl,
    payTo: payToMap,
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
