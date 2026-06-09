import { config } from "../config.js";
import { pickBestResource, searchMarketplace } from "../lib/marketplace.js";
import type { ResearchInput } from "../types.js";

export type ResearchBriefResult = {
  topic: string;
  brief: string;
  sources: Array<{ name?: string; url?: string; priceUsdc?: number; qualityScore?: number }>;
  estimatedCostUsdc: number;
  pipeline: string[];
};

export async function runResearchBrief(input: ResearchInput): Promise<ResearchBriefResult> {
  if (input.fastProbe) {
    return {
      topic: input.topic,
      brief: `Verifier fast-path brief for "${input.topic}" — use full research/brief in production for live marketplace sourcing.`,
      sources: [
        {
          name: "x402 Trust Layer Proxy",
          url: `${config.publicBaseUrl}/api/x402/proxy`,
          priceUsdc: 0.08,
          qualityScore: 90,
        },
      ],
      estimatedCostUsdc: 0.1,
      pipeline: [
        "1. POST /api/x402/proxy preflight",
        "2. x402_fetch selected oracle",
        "3. Summarize with your LLM agent",
      ],
    };
  }

  const priceQuery = input.includePrice ? `${input.topic} price oracle` : input.topic;
  const translateQuery = input.language ? `translate ${input.language}` : null;

  const [priceApis, topicApis] = await Promise.all([
    searchMarketplace(priceQuery, { limit: 5, maxPriceUsdc: 0.05 }),
    searchMarketplace(input.topic, { limit: 5, maxPriceUsdc: 0.1 }),
  ]);

  const oracle = pickBestResource(priceApis, "base");
  const context = pickBestResource(topicApis);

  const sources = [oracle, context].filter(Boolean).map((s) => ({
    name: s?.name,
    url: s?.url,
    priceUsdc: s?.priceUsdc,
    qualityScore: s?.qualityScore,
  }));

  const estimatedCostUsdc =
    (oracle?.priceUsdc ?? 0.01) + (context?.priceUsdc ?? 0.02) + 0.02;

  const pipeline = [
    "1. Risk-gate target URLs (optional)",
    `2. Fetch oracle: ${oracle?.url ?? "none found"}`,
    `3. Fetch context API: ${context?.url ?? "none found"}`,
    "4. Summarize into brief (your LLM agent step)",
  ];

  const brief = [
    `# Research brief: ${input.topic}`,
    "",
    "## Recommended x402 pipeline",
    ...pipeline.map((p) => `- ${p}`),
    "",
    "## Suggested paid sources",
    ...sources.map(
      (s, i) =>
        `${i + 1}. ${s.name ?? "API"} — ${s.url ?? "n/a"} (~$${(s.priceUsdc ?? 0).toFixed(3)}, q${s.qualityScore ?? "?"})`,
    ),
    "",
    "## Next step for your agent",
    "Call each URL with OpenDexter `x402_fetch` or `@dexterai/x402` wrapFetch, then pass JSON outputs to your LLM for the final brief.",
    "",
    `Estimated micro-cost: ~$${estimatedCostUsdc.toFixed(3)} USDC + this endpoint fee.`,
  ].join("\n");

  return {
    topic: input.topic,
    brief,
    sources,
    estimatedCostUsdc,
    pipeline,
  };
}
