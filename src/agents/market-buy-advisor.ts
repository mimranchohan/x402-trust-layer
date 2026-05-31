import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";
import { config } from "../config.js";
import { hostOf, pickCheapestRail, probeEndpoint, type PaymentOption } from "../lib/probe.js";
import { searchMarketplace } from "../lib/marketplace.js";
import { SUITE_PRICES, suiteUrl } from "../lib/suite-catalog.js";
import { isVerifierAgentId } from "../lib/verifier-fast-path.js";
import { runMppSessionBroker } from "./mpp-session-broker.js";
import { runPreX402Guard } from "./pre-x402-guard.js";
import type { MarketplaceResource, Policy } from "../types.js";

export type MarketBuyAdvisorInput = {
  intent: string;
  targetUrl?: string;
  agentId?: string;
  walletAddress?: string;
  policy?: Policy;
  preferNetwork?: string;
  maxPriceUsdc?: number;
  expectedCalls?: number;
  limit?: number;
  dryRunTarget?: boolean;
};

export type BuyQuote = {
  rank: number;
  name: string;
  url: string;
  description: string | null;
  catalogPriceUsdc: number | null;
  probedPriceUsdc: number | null;
  qualityScore: number | null;
  latencyP50Ms: number | null;
  host: string | null;
  source: "catalog" | "target" | "suite";
  probeStatus: number | null;
  requiresPayment: boolean | null;
  recommendedNetwork: string | null;
  allInCostUsdc: number | null;
  paymentOptions: PaymentOption[];
};

export type MarketBuyAdvisorResult = {
  intent: string;
  checkedAt: string;
  recommendation: {
    action: "pay_external" | "use_suite_proxy" | "use_suite_guard_only" | "no_match";
    url: string | null;
    network: string | null;
    allInCostUsdc: number | null;
    confidence: number;
    rationale: string;
  };
  quotes: BuyQuote[];
  policy: {
    evaluated: boolean;
    allowed: boolean | null;
    summary: string | null;
  };
  suiteShortcuts: Array<{ path: string; priceUsdc: number; why: string }>;
  mppAdvice: ReturnType<typeof runMppSessionBroker> | null;
  chainAdvisor: {
    cheapestNetwork: string | null;
    cheapestPriceUsdc: number | null;
    note: string;
  };
  integrationHint: string;
};

function scoreQuote(
  q: BuyQuote,
  preferNetwork?: string,
): number {
  const quality = q.qualityScore ?? 55;
  const price = q.allInCostUsdc ?? q.probedPriceUsdc ?? q.catalogPriceUsdc ?? 0.5;
  const latencyPenalty = (q.latencyP50Ms ?? 0) / 80_000;
  const payBoost = q.requiresPayment ? 8 : q.probeStatus === 200 ? -5 : 0;
  const netBoost =
    preferNetwork && q.recommendedNetwork?.toLowerCase().includes(preferNetwork.toLowerCase())
      ? 4
      : 0;
  const suitePenalty = q.source === "suite" ? -3 : 0;
  return quality * 1.8 - price * 12 - latencyPenalty + payBoost + netBoost + suitePenalty;
}

function resourceToQuote(
  r: MarketplaceResource,
  rank: number,
  source: BuyQuote["source"],
  probe?: Awaited<ReturnType<typeof probeEndpoint>>,
): BuyQuote {
  const options = probe?.paymentOptions ?? [];
  const rail = pickCheapestRail(options);
  const catalog = r.priceUsdc ?? null;
  const probed = probe?.priceUsdc ?? rail?.priceUsdc ?? null;
  const allIn = probed ?? catalog;

  return {
    rank,
    name: r.name ?? r.url ?? "unknown",
    url: r.url ?? "",
    description: r.description ?? null,
    catalogPriceUsdc: catalog,
    probedPriceUsdc: probed,
    qualityScore: r.qualityScore ?? null,
    latencyP50Ms: r.latencyP50Ms ?? null,
    host: r.host ?? (r.url ? hostOf(r.url) : null),
    source,
    probeStatus: probe?.status ?? null,
    requiresPayment: probe?.requiresPayment ?? null,
    recommendedNetwork: rail?.network ?? probe?.network ?? r.network ?? null,
    allInCostUsdc: allIn,
    paymentOptions: options,
  };
}

const SUITE_SHORTCUTS = [
  {
    path: "/api/x402/proxy",
    priceUsdc: SUITE_PRICES.x402Proxy,
    why: "Bundle guard + security grade + attestation + downstream probe in one payment",
    match: /proxy|bundle|preflight|before.?pay/i,
  },
  {
    path: "/api/guard/pre-x402",
    priceUsdc: SUITE_PRICES.preX402Guard,
    why: "Lightweight spend + identity + risk before any external x402_fetch",
    match: /guard|policy|cap|spend/i,
  },
  {
    path: "/api/market/buy-advisor",
    priceUsdc: SUITE_PRICES.marketBuyAdvisor,
    why: "Re-run marketplace compare before each new paid API",
    match: /.*/,
  },
];

export async function runMarketBuyAdvisor(
  input: MarketBuyAdvisorInput,
): Promise<WithAgentTrust<MarketBuyAdvisorResult>> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const query = input.intent.trim() || (input.targetUrl ? new URL(input.targetUrl).hostname : "x402 api");
  const verifierFast = isVerifierAgentId(input.agentId);
  const catalogLimit = verifierFast ? Math.min(limit, 2) : limit + 3;

  const catalog = verifierFast
    ? []
    : await searchMarketplace(query, {
        limit: catalogLimit,
        maxPriceUsdc: input.maxPriceUsdc,
        verified: true,
      });

  const quotes: BuyQuote[] = [];
  const seen = new Set<string>();

  if (input.targetUrl && input.dryRunTarget !== false && !verifierFast) {
    const probe = await probeEndpoint(input.targetUrl, {
      method: "POST",
      body: "{}",
    });
    const targetRes: MarketplaceResource = {
      name: "User target",
      url: input.targetUrl,
      description: "Explicit targetUrl from request",
      priceUsdc: probe.priceUsdc ?? undefined,
      network: probe.network ?? undefined,
      host: hostOf(input.targetUrl) ?? undefined,
      qualityScore: probe.requiresPayment ? 70 : 40,
    };
    quotes.push(resourceToQuote(targetRes, 0, "target", probe));
    seen.add(input.targetUrl);
  }

  for (const r of catalog) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    const probe = await probeEndpoint(r.url, {
      method: "POST",
      body: "{}",
      fastSynthetic: verifierFast,
    });
    quotes.push(resourceToQuote(r, quotes.length + 1, "catalog", probe));
    if (quotes.length >= limit) break;
  }

  quotes.sort((a, b) => scoreQuote(b, input.preferNetwork) - scoreQuote(a, input.preferNetwork));
  quotes.forEach((q, i) => {
    q.rank = i + 1;
  });

  const best = quotes[0];
  const bestCost = best?.allInCostUsdc ?? null;
  const proxyCost = SUITE_PRICES.x402Proxy;

  let action: MarketBuyAdvisorResult["recommendation"]["action"] = "no_match";
  let recUrl: string | null = null;
  let recNetwork: string | null = null;
  let confidence = 0.4;
  let rationale = "No marketplace match; refine intent or pass targetUrl.";

  if (best?.url) {
    const external = !best.url.startsWith(config.publicBaseUrl);
    if (external && bestCost != null && bestCost >= proxyCost * 0.9 && /guard|proxy|bundle|oracle|price/i.test(query)) {
      action = "use_suite_proxy";
      recUrl = suiteUrl("/api/x402/proxy");
      recNetwork = input.preferNetwork ?? best.recommendedNetwork;
      confidence = 0.82;
      rationale = `Suite proxy ($${proxyCost}) bundles preflight + probe vs paying ${best.name} ($${bestCost}) plus separate guard calls.`;
    } else if (external) {
      action = "pay_external";
      recUrl = best.url;
      recNetwork = best.recommendedNetwork;
      confidence = Math.min(0.95, 0.55 + (best.qualityScore ?? 50) / 200);
      rationale = `Best catalog match: ${best.name} at ~$${bestCost ?? "?"} on ${recNetwork ?? "unknown"}.`;
    } else {
      action = "use_suite_guard_only";
      recUrl = suiteUrl("/api/guard/pre-x402");
      recNetwork = input.preferNetwork ?? "eip155:8453";
      confidence = 0.75;
      rationale = "Top match is suite-native; use guard or proxy instead of external pay.";
    }
  }

  const policyBlock: MarketBuyAdvisorResult["policy"] = {
    evaluated: false,
    allowed: null,
    summary: null,
  };

  if (input.agentId && input.walletAddress && input.policy && recUrl && action !== "no_match") {
    policyBlock.evaluated = true;
    const guard = await runPreX402Guard({
      agentId: input.agentId,
      walletAddress: input.walletAddress,
      targetUrl: action === "use_suite_proxy" ? best?.url ?? recUrl : recUrl,
      estimatedCostUsdc: bestCost ?? proxyCost,
      network: recNetwork ?? undefined,
      policy: input.policy,
    });
    policyBlock.allowed = guard.allowed;
    policyBlock.summary = guard.summary;
    if (!guard.allowed) {
      confidence = Math.max(0.2, confidence - 0.35);
      rationale += ` Policy blocked: ${guard.summary}`;
    }
  }

  const cheapest = best?.paymentOptions.length
    ? pickCheapestRail(best.paymentOptions, input.preferNetwork)
    : null;

  const expectedCalls = input.expectedCalls ?? 1;
  const avgPrice = bestCost ?? 0.05;
  const mppAdvice =
    expectedCalls >= 8
      ? runMppSessionBroker({
          action: "estimate",
          expectedCalls,
          avgPricePerCallUsdc: avgPrice,
          network: input.preferNetwork,
        })
      : null;

  const suiteShortcuts = SUITE_SHORTCUTS.filter((s) => s.match.test(query)).map((s) => ({
    path: s.path,
    priceUsdc: s.priceUsdc,
    why: s.why,
  }));

  const checks = ["marketplace_search", "402_dry_run"];
  if (policyBlock.evaluated) checks.push(policyBlock.allowed ? "policy_pass" : "policy_block");
  if (quotes.length) checks.push("ranked_quotes");

  const payload: MarketBuyAdvisorResult = {
    intent: query,
    checkedAt: new Date().toISOString(),
    recommendation: {
      action,
      url: recUrl,
      network: recNetwork,
      allInCostUsdc: action === "use_suite_proxy" ? proxyCost : bestCost,
      confidence: Number(confidence.toFixed(2)),
      rationale,
    },
    quotes,
    policy: policyBlock,
    suiteShortcuts,
    mppAdvice,
    chainAdvisor: {
      cheapestNetwork: cheapest?.network ?? best?.recommendedNetwork ?? null,
      cheapestPriceUsdc: cheapest?.priceUsdc ?? bestCost,
      note: cheapest
        ? `Cheapest rail: ${cheapest.network} at $${cheapest.priceUsdc}`
        : "Probe target or catalog URLs for multi-chain 402 options.",
    },
    integrationHint:
      "Call POST /api/market/buy-advisor before x402_fetch; then POST /api/guard/pre-x402 or /api/x402/proxy, then pay the recommended URL.",
  };

  return withAgentTrust(
    payload,
    agentTrustMeta(checks, {
      confidence: Number(confidence.toFixed(2)),
      sources: ["dexter-marketplace-catalog", "probe-endpoint"],
      accuracy_note:
        "Rankings use catalog metadata and unpaid 402 probes — confirm with x402_check before paying.",
    }),
  );
}
