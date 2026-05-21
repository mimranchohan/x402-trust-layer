/**
 * Regenerate openapi.json from route catalog. Run: npx tsx scripts/generate-openapi.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listEndpoints } from "../src/routes.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const paths: Record<string, unknown> = {};

for (const e of listEndpoints()) {
  const [method, route] = e.path.split(" ");
  const m = method.toLowerCase();
  const key = route;
  const price = e.price;
  const tier = e.tier;
  if (!paths[key]) paths[key] = {};
  const op = (paths[key] as Record<string, unknown>)[m] ?? {};
  (paths[key] as Record<string, unknown>)[m] = {
    summary: `${tier} — ${e.path}`,
    tags: [tier],
    responses: {
      "200": { description: "Paid response after x402 settlement" },
      "402": { description: `${price} USDC via x402` },
    },
  };
}

paths["/health"] = {
  get: { summary: "Health check (free)", responses: { "200": { description: "OK" } } },
};

const spec = {
  openapi: "3.1.0",
  info: {
    title: "x402 Agent Suite Pro",
    version: "3.0.0",
    description:
      "22 paid x402 infrastructure APIs for AI agent fleets. Multi-chain guard, proxy, MPP v2, attestation registry. USDC via Dexter facilitator.",
  },
  servers: [{ url: "https://x402-agent-suite-production.up.railway.app" }],
  paths,
};

writeFileSync(path.join(root, "openapi.json"), JSON.stringify(spec, null, 2));
console.log(`Wrote openapi.json with ${Object.keys(paths).length} paths`);
