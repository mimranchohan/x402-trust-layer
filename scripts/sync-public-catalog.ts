/**
 * Sync public/data/agents.json with src/routes/catalog.ts + openapi.json summaries.
 * Run: npm run sync:public && npm run docs:ai
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listEndpoints } from "../src/routes/catalog.js";

type AgentRow = {
  id: string;
  name: string;
  tier: string;
  tierLabel: string;
  layer: string;
  method: string;
  path: string;
  price: number;
  summary: string;
  why: string;
  inputs: string[];
  outputs: string[];
  tags: string[];
};

const agentsPath = join(process.cwd(), "public/data/agents.json");
const openapi = JSON.parse(readFileSync(join(process.cwd(), "openapi.json"), "utf8")) as {
  paths?: Record<string, Record<string, { summary?: string; description?: string }>>;
};

const catalog = JSON.parse(readFileSync(agentsPath, "utf8")) as {
  product: string;
  domain: string;
  tagline: string;
  layers: unknown[];
  agents: AgentRow[];
};

const byPath = new Map(catalog.agents.map((a) => [a.path, a]));

const TIER_META: Record<string, { tierLabel: string; layer: string }> = {
  killer: { tierLabel: "Killer APIs", layer: "guard" },
  entry: { tierLabel: "Entry & Gateway", layer: "guard" },
  bundle: { tierLabel: "Bundles", layer: "guard" },
  orchestration: { tierLabel: "Orchestration", layer: "settlement" },
  core: { tierLabel: "Core Gates", layer: "guard" },
  identity: { tierLabel: "Identity", layer: "attestation" },
  attestation: { tierLabel: "Attestation", layer: "attestation" },
  trust: { tierLabel: "Trust & Refunds", layer: "compliance" },
  intelligence: { tierLabel: "Intelligence", layer: "settlement" },
  enterprise: { tierLabel: "Enterprise", layer: "compliance" },
  tier1: { tierLabel: "Tier-1 Enterprise", layer: "guard" },
  protocol: { tierLabel: "Agent Trust Protocol v4", layer: "guard" },
};

function slug(path: string): string {
  return path.replace(/^\/api\//, "").replace(/\//g, "-");
}

function displayName(path: string): string {
  const tail = path.replace(/^\/api\//, "").split("/").pop() ?? path;
  return tail
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function openapiSummary(method: string, path: string): string {
  const op = openapi.paths?.[path]?.[method.toLowerCase()];
  if (!op) return path;
  if (op.summary) return op.summary;
  const desc = op.description ?? "";
  const cut = desc.split(" —")[0]?.trim();
  return cut || path;
}

for (const ep of listEndpoints()) {
  const [method, path] = ep.path.split(" ");
  const price = Number.parseFloat(ep.price.replace("$", ""));
  const existing = byPath.get(path);
  if (existing) {
    existing.price = price;
    existing.method = method;
    existing.tier = ep.tier;
    const meta = TIER_META[ep.tier];
    if (meta) {
      existing.tierLabel = meta.tierLabel;
      if (ep.tier === "protocol") existing.layer = meta.layer;
    }
    continue;
  }
  const meta = TIER_META[ep.tier] ?? TIER_META.core;
  byPath.set(path, {
    id: slug(path),
    name: displayName(path),
    tier: ep.tier,
    tierLabel: meta.tierLabel,
    layer: meta.layer,
    method,
    path,
    price,
    summary: openapiSummary(method, path),
    why: "Paid x402 Trust Layer API — see OpenAPI for request schema.",
    inputs: ["see OpenAPI"],
    outputs: ["see OpenAPI"],
    tags: [ep.tier, "x402"],
  });
}

catalog.agents = listEndpoints().map((ep) => {
  const path = ep.path.split(" ")[1]!;
  const row = byPath.get(path);
  if (!row) throw new Error(`missing agent row for ${path}`);
  return row;
});

writeFileSync(agentsPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${catalog.agents.length} agents to public/data/agents.json`);
