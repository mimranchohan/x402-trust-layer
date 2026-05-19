import { pickBestResource, searchMarketplace } from "../lib/marketplace.js";
import { probeEndpoint } from "../lib/probe.js";
import type { RouterInput } from "../types.js";

export type RouterResult = {
  query: string;
  selected: ReturnType<typeof pickBestResource> extends infer T ? T : never;
  alternatives: Awaited<ReturnType<typeof searchMarketplace>>;
  executed: boolean;
  executionNote: string | null;
  probedPriceUsdc: number | null;
};

export async function runApiRouter(input: RouterInput): Promise<RouterResult> {
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
