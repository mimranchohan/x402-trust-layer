import { config } from "../config.js";
import { pickBestResource, searchMarketplace } from "../lib/marketplace.js";
import { probeEndpoint } from "../lib/probe.js";
import type { RouterInput } from "../types.js";

const SUITE_ROUTES: Array<{ match: RegExp; path: string; name: string; priceUsdc: number }> = [
  { match: /guard|preflight|pre-x402/i, path: "/api/guard/pre-x402", name: "Pre-x402 Guard", priceUsdc: 0.05 },
  { match: /buy|quote|market|compare|jupiter|before.?pay/i, path: "/api/market/buy-advisor", name: "x402 Buy Advisor", priceUsdc: 0.08 },
  { match: /proxy|bundle/i, path: "/api/x402/proxy", name: "x402 Proxy", priceUsdc: 0.08 },
  { match: /audition|seller|coach|x402gle|discovery.?fix/i, path: "/api/seller/audition-coach", name: "Audition Coach", priceUsdc: 0.06 },
  { match: /mpp|session|batch/i, path: "/api/mpp/session", name: "MPP Session v2", priceUsdc: 0.03 },
  { match: /attest|trust/i, path: "/api/attestation/issue", name: "Attestation Issue", priceUsdc: 0.04 },
  { match: /pipeline|orchestrat/i, path: "/api/pipeline/execute", name: "Pipeline Execute", priceUsdc: 0.25 },
  { match: /spend|budget|governor/i, path: "/api/spend-governor/check", name: "Spend Governor", priceUsdc: 0.03 },
];

/** Curated external x402 APIs for common agent queries (before Dexter catalog search) */
const CURATED_ROUTES: Array<{
  match: RegExp;
  url: string;
  name: string;
  description: string;
  priceUsdc: number;
}> = [
  {
    match: /eth.*(price|oracle|usd|spot)|ethereum.*(price|usd)|\beth\b.*\busd\b/i,
    url: "https://api.myceliasignal.com/oracle/price/eth/usd",
    name: "Mycelia ETH/USD Oracle",
    description: "ETH spot price oracle (x402-protected)",
    priceUsdc: 0.05,
  },
  {
    match: /btc.*(price|oracle|usd)|bitcoin.*price/i,
    url: "https://api.myceliasignal.com/oracle/price/btc/usd",
    name: "Mycelia BTC/USD Oracle",
    description: "BTC spot price oracle (x402-protected)",
    priceUsdc: 0.05,
  },
];

export type RouterResult = {
  status: "ok" | "not_found";
  summary: string;
  query: string;
  selected: ReturnType<typeof pickBestResource> extends infer T ? T : never;
  alternatives: Awaited<ReturnType<typeof searchMarketplace>>;
  executed: boolean;
  executionNote: string | null;
  probedPriceUsdc: number | null;
};

function normalizeNetwork(prefer?: string): "solana" | "base" | "polygon" {
  const v = (prefer ?? "").toLowerCase();
  if (v.includes("base") || v.includes("8453")) return "base";
  if (v.includes("polygon") || v.includes("137")) return "polygon";
  return "solana";
}

function probeOpts(skip?: boolean) {
  return { fastSynthetic: skip === true };
}

export async function runApiRouter(input: RouterInput): Promise<RouterResult> {
  const normalizedNetwork = normalizeNetwork(input.preferNetwork);

  // Route-capability intent (bridge/erc20/usdc route lookup) should return
  // suite route options filtered by network/price, not unrelated oracle picks.
  const routeIntent =
    /\broute\b|routing|from\s+.+\s+to\b|bridge|swap path|usdc.*(source|destination)|erc-?20 transfer|arbitrum.*ethereum|ethereum.*arbitrum|dexter.*usdc/i.test(
      input.query,
    );
  if (routeIntent) {
    const suiteOptions = [
      { name: "x402 Proxy", path: "/api/x402/proxy", priceUsdc: 0.08 },
      { name: "Pipeline Execute", path: "/api/pipeline/execute", priceUsdc: 0.25 },
      { name: "Pre-x402 Guard", path: "/api/guard/pre-x402", priceUsdc: 0.05 },
    ].filter((r) => input.maxPriceUsdc == null || r.priceUsdc <= input.maxPriceUsdc);

    if (suiteOptions.length === 0) {
      return {
        status: "not_found",
        summary: "No route-capability options satisfy maxPriceUsdc",
        query: input.query,
        selected: null,
        alternatives: [],
        executed: false,
        executionNote: "No valid route under price/network constraints",
        probedPriceUsdc: null,
      };
    }

    const best = suiteOptions[0];
    const url = `${config.publicBaseUrl}${best.path}`;
    const probe = await probeEndpoint(url, probeOpts(input.skipProbes));
    return {
      status: "ok",
      summary: `Matched route-capability intent on ${normalizedNetwork}`,
      query: input.query,
      selected: {
        name: best.name,
        url,
        description: `x402 route-capability option on ${normalizedNetwork}`,
        priceUsdc: best.priceUsdc,
        network: normalizedNetwork,
        qualityScore: 90,
      },
      alternatives: suiteOptions.slice(1).map((r) => ({
        name: r.name,
        url: `${config.publicBaseUrl}${r.path}`,
        description: `Alternative on ${normalizedNetwork}`,
        priceUsdc: r.priceUsdc,
        network: normalizedNetwork,
        qualityScore: 84,
      })),
      executed: false,
      executionNote: "Route options filtered by network/price constraints",
      probedPriceUsdc: probe.priceUsdc ?? best.priceUsdc,
    };
  }

  const curatedHit = CURATED_ROUTES.find((r) => r.match.test(input.query));
  if (curatedHit) {
    if (input.maxPriceUsdc != null && curatedHit.priceUsdc > input.maxPriceUsdc) {
      return {
        status: "not_found",
        summary: "No curated route within maxPriceUsdc",
        query: input.query,
        selected: null,
        alternatives: [],
        executed: false,
        executionNote: "Price filter excluded curated match",
        probedPriceUsdc: null,
      };
    }
    const probe = await probeEndpoint(curatedHit.url, probeOpts(input.skipProbes));
    return {
      status: "ok",
      summary: "Matched curated route from query intent",
      query: input.query,
      selected: {
        name: curatedHit.name,
        url: curatedHit.url,
        description: curatedHit.description,
        priceUsdc: probe.priceUsdc ?? curatedHit.priceUsdc,
        network: normalizedNetwork,
        qualityScore: 88,
      },
      alternatives: [],
      executed: false,
      executionNote: "Curated oracle route for ETH/BTC price queries",
      probedPriceUsdc: probe.priceUsdc ?? curatedHit.priceUsdc,
    };
  }

  const suiteHit = SUITE_ROUTES.find((r) => r.match.test(input.query));
  if (suiteHit) {
    const suiteUrl = `${config.publicBaseUrl}${suiteHit.path}`;
    const probe = await probeEndpoint(suiteUrl, probeOpts(input.skipProbes));
    return {
      status: "ok",
      summary: "Matched suite-native route from query intent",
      query: input.query,
      selected: {
        name: suiteHit.name,
        url: suiteUrl,
        description: "Suite-native route (prefer before external marketplace)",
        priceUsdc: suiteHit.priceUsdc,
        network: input.preferNetwork ?? "solana",
        qualityScore: 90,
      },
      alternatives: [],
      executed: false,
      executionNote: "Routed to x402 Agent Suite infrastructure on this host",
      probedPriceUsdc: probe.priceUsdc ?? suiteHit.priceUsdc,
    };
  }

  const resources = await searchMarketplace(input.query, {
    limit: 10,
    maxPriceUsdc: input.maxPriceUsdc,
  });

  const selected = pickBestResource(resources, input.preferNetwork, input.query);

  if (!selected?.url) {
    return {
      status: "not_found",
      summary: "No route matched query constraints",
      query: input.query,
      selected: null,
      alternatives: resources,
      executed: false,
      executionNote: "No marketplace match found",
      probedPriceUsdc: null,
    };
  }

  const probe = await probeEndpoint(selected.url, probeOpts(input.skipProbes));

  if (!input.execute) {
    return {
      status: "ok",
      summary: "Route selected; execution disabled by default",
      query: input.query,
      selected,
      alternatives: resources.slice(0, 5),
      executed: false,
      executionNote: "Set execute:true to call downstream API (requires payer wallet in client)",
      probedPriceUsdc: probe.priceUsdc,
    };
  }

  return {
    status: "ok",
    summary: "Route selected; caller should execute via x402 client",
    query: input.query,
    selected,
    alternatives: resources.slice(0, 5),
    executed: false,
    executionNote:
      "Server-side execution disabled by default. Use OpenDexter x402_fetch or wrapFetch from your agent with the selected URL.",
    probedPriceUsdc: probe.priceUsdc,
  };
}
