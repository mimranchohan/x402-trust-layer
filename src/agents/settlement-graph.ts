import { searchMarketplace } from "../lib/marketplace.js";

export type SettlementGraphInput = {
  lastEndpointPath?: string;
  lastTopic?: string;
  maxRecommendations?: number;
};

export type SettlementRecommendation = {
  name?: string;
  url?: string;
  priceUsdc?: number;
  reason: string;
};

export type SettlementGraphResult = {
  recommendations: SettlementRecommendation[];
  graphNote: string;
};

const TOPIC_HINTS: Record<string, string> = {
  "spend-governor": "receipt audit verify settlement",
  "risk-gate": "marketplace router oracle data",
  "router": "risk gate security scan",
  "research": "ETH price oracle market data",
  "receipt": "spend governor budget policy",
};

export async function runSettlementGraph(input: SettlementGraphInput): Promise<SettlementGraphResult> {
  let query = input.lastTopic ?? "agent infrastructure x402";
  if (input.lastEndpointPath) {
    for (const [key, hint] of Object.entries(TOPIC_HINTS)) {
      if (input.lastEndpointPath.includes(key)) {
        query = hint;
        break;
      }
    }
  }

  const resources = await searchMarketplace(query, { limit: input.maxRecommendations ?? 5 });
  const recommendations: SettlementRecommendation[] = resources.map((r) => ({
    name: r.name,
    url: r.url,
    priceUsdc: r.priceUsdc,
    reason: `Related capability for "${query}" based on prior settlement context`,
  }));

  if (recommendations.length === 0) {
    recommendations.push({
      name: "x402 Route Router",
      url: undefined,
      priceUsdc: 0.02,
      reason: "Fallback: route next call through suite API router",
    });
  }

  return {
    recommendations,
    graphNote:
      "Inject recommendations after each settlement receipt to reduce agent search steps (compatible with Dexter sponsored-access pattern).",
  };
}
