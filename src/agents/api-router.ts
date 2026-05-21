import { config } from "../config.js";
import { pickBestResource, searchMarketplace } from "../lib/marketplace.js";
import { probeEndpoint } from "../lib/probe.js";
import type { RouterInput } from "../types.js";

const SUITE_ROUTES: Array<{ match: RegExp; path: string; name: string; priceUsdc: number }> = [
  { match: /guard|preflight|pre-x402/i, path: "/api/guard/pre-x402", name: "Pre-x402 Guard", priceUsdc: 0.05 },
  { match: /proxy|bundle/i, path: "/api/x402/proxy", name: "x402 Proxy", priceUsdc: 0.08 },
  { match: /mpp|session|batch/i, path: "/api/mpp/session", name: "MPP Session v2", priceUsdc: 0.03 },
  { match: /attest|trust/i, path: "/api/attestation/issue", name: "Attestation Issue", priceUsdc: 0.04 },
  { match: /pipeline|orchestrat/i, path: "/api/pipeline/execute", name: "Pipeline Execute", priceUsdc: 0.25 },
  { match: /spend|budget|governor/i, path: "/api/spend-governor/check", name: "Spend Governor", priceUsdc: 0.03 },
];

export type RouterResult = {
  query: string;
  selected: ReturnType<typeof pickBestResource> extends infer T ? T : never;
  alternatives: Awaited<ReturnType<typeof searchMarketplace>>;
  executed: boolean;
  executionNote: string | null;
  probedPriceUsdc: number | null;
};

export async function runApiRouter(input: RouterInput): Promise<RouterResult> {
  const suiteHit = SUITE_ROUTES.find((r) => r.match.test(input.query));
  if (suiteHit) {
    const suiteUrl = `${config.publicBaseUrl}${suiteHit.path}`;
    const probe = await probeEndpoint(suiteUrl);
    return {
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

  const selected = pickBestResource(resources, input.preferNetwork);

  if (!selected?.url) {
    return {
      query: input.query,
      selected: null,
      alternatives: resources,
      executed: false,
      executionNote: "No marketplace match found",
      probedPriceUsdc: null,
    };
  }

  const probe = await probeEndpoint(selected.url);

  if (!input.execute) {
    return {
      query: input.query,
      selected,
      alternatives: resources.slice(0, 5),
      executed: false,
      executionNote: "Set execute:true to call downstream API (requires payer wallet in client)",
      probedPriceUsdc: probe.priceUsdc,
    };
  }

  return {
    query: input.query,
    selected,
    alternatives: resources.slice(0, 5),
    executed: false,
    executionNote:
      "Server-side execution disabled by default. Use OpenDexter x402_fetch or wrapFetch from your agent with the selected URL.",
    probedPriceUsdc: probe.priceUsdc,
  };
}
