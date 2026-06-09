import type { MarketplaceResource } from "../types.js";
import { logger } from "./logger.js";

type MarketplaceResponse = {
  resources?: MarketplaceResource[];
  data?: MarketplaceResource[] | { resources?: MarketplaceResource[] };
  strongResults?: MarketplaceResource[];
  relatedResults?: MarketplaceResource[];
  items?: MarketplaceResource[];
};

type LabResource = {
  name?: string;
  description?: string;
  public_url?: string;
  base_price_usdc?: number;
  tags?: string[];
};

type LabResponse = {
  resources?: LabResource[];
};

function normalizeQuery(q: string): string {
  return q.toLowerCase().trim();
}

function matchesQuery(resource: { name?: string; description?: string; tags?: string[] }, query: string): boolean {
  const q = normalizeQuery(query);
  const haystack = [resource.name, resource.description, ...(resource.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.some((t) => haystack.includes(t));
}

function mapLabResource(r: LabResource): MarketplaceResource {
  return {
    name: r.name,
    description: r.description,
    url: r.public_url,
    priceUsdc: r.base_price_usdc,
    network: "solana",
  };
}

function mergeResources(body: MarketplaceResponse): MarketplaceResource[] {
  const nested = body.data;
  const fromData = Array.isArray(nested)
    ? nested
    : nested && typeof nested === "object"
      ? nested.resources
      : undefined;

  const merged = [
    ...(body.resources ?? []),
    ...(fromData ?? []),
    ...(body.strongResults ?? []),
    ...(body.relatedResults ?? []),
    ...(body.items ?? []),
  ];

  const seen = new Set<string>();
  return merged.filter((r) => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

async function searchFacilitatorCatalog(
  query: string,
  options: { limit?: number; maxPriceUsdc?: number; verified?: boolean },
): Promise<MarketplaceResource[]> {
  const url = new URL("https://api.dexter.cash/api/facilitator/marketplace/resources");
  url.searchParams.set("search", query);
  url.searchParams.set("sort", "quality_score");
  url.searchParams.set("limit", String(options.limit ?? 15));
  if (options.verified !== false) url.searchParams.set("verified", "true");
  if (options.maxPriceUsdc != null) {
    url.searchParams.set("maxPrice", String(options.maxPriceUsdc));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    throw new Error(`facilitator catalog HTTP ${res.status}`);
  }

  const body = (await res.json()) as MarketplaceResponse;
  return mergeResources(body);
}

async function searchLabCatalog(
  query: string,
  options: { limit?: number; maxPriceUsdc?: number },
): Promise<MarketplaceResource[]> {
  const url = new URL("https://api.dexter.cash/api/dexter-lab/resources/public");
  url.searchParams.set("limit", String(Math.min(options.limit ?? 15, 50)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    throw new Error(`lab catalog HTTP ${res.status}`);
  }

  const body = (await res.json()) as LabResponse;
  let list = (body.resources ?? []).map(mapLabResource);

  list = list.filter((r) => matchesQuery({ name: r.name, description: r.description }, query));

  if (options.maxPriceUsdc != null) {
    list = list.filter((r) => (r.priceUsdc ?? 999) <= options.maxPriceUsdc!);
  }

  return list.slice(0, options.limit ?? 15);
}

export async function searchMarketplace(
  query: string,
  options: { limit?: number; maxPriceUsdc?: number; verified?: boolean } = {},
): Promise<MarketplaceResource[]> {
  try {
    const primary = await searchFacilitatorCatalog(query, options);
    if (primary.length > 0) return primary;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[marketplace] facilitator catalog search failed");
  }

  try {
    return await searchLabCatalog(query, options);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), query }, "[marketplace] lab catalog fallback failed");
    return [];
  }
}

export function pickBestResource(
  resources: MarketplaceResource[],
  preferNetwork?: string,
  query?: string,
): MarketplaceResource | null {
  if (resources.length === 0) return null;

  const scored = resources
    .map((r) => {
      const quality = r.qualityScore ?? 50;
      const price = r.priceUsdc ?? 1;
      const latencyPenalty = (r.latencyP50Ms ?? 0) / 100_000;
      const networkBoost =
        preferNetwork && r.network?.toLowerCase().includes(preferNetwork.toLowerCase()) ? 5 : 0;
      const haystack = [r.name, r.description, r.url].filter(Boolean).join(" ").toLowerCase();
      const q = (query ?? "").toLowerCase();
      const wantsOracle = /eth|ethereum|oracle|price|usd|btc|bitcoin/.test(q);
      const oracleBoost =
        wantsOracle && /mycelia|oracle\/price/.test(haystack) ? 12 : 0;
      return {
        r,
        score: quality * 2 - price * 10 - latencyPenalty + networkBoost + oracleBoost,
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.r ?? null;
}
