/**
 * One-time helper: extracts post()/app.get() blocks from register-all.ts into route modules.
 * Run: node scripts/split-route-modules.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/routes/register-all.ts"), "utf8");

const moduleForPath = (path) => {
  if (/^\/api\/(guard|x402\/proxy|pipeline\/execute|agent\/verify)/.test(path)) return "guard";
  if (/^\/api\/attestation/.test(path)) return "trust";
  if (/^\/api\/(mpp|payment-intent|facilitator)/.test(path)) return "mpp";
  if (/^\/api\/(market|seller|merchant-trust|trust-network)/.test(path)) return "market";
  if (/^\/api\/mandate/.test(path)) return "mandate";
  if (/^\/api\/(agent-escrow|quality-escrow)/.test(path)) return "escrow";
  if (/^\/api\/(compliance|dispute|evidence-locker)/.test(path)) return "compliance";
  if (/^\/api\/(receipt-auditor|refund-arbiter|settlement-graph)/.test(path)) return "settlement";
  if (/^\/api\/(a2a|bedrock|pipeline\/trust-v2)/.test(path)) return "a2a";
  if (path === "/api/pipeline/full") return "guard";
  return "network";
};

const start = src.indexOf("  post(\n");
const endMarker = "  registerProtocolRoutes(app";
const body = src.slice(start, src.indexOf(endMarker));

const blocks = [];
const re = /  (post|app\.get)\(\s*\n\s*"([^"]+)"/g;
let m;
const indices = [];
while ((m = re.exec(body)) !== null) {
  indices.push({ kind: m[1], path: m[2], index: m.index });
}
indices.push({ index: body.length });

const grouped = {};
for (let i = 0; i < indices.length - 1; i++) {
  const { kind, path, index } = indices[i];
  const chunk = body.slice(index, indices[i + 1].index).trimEnd();
  const mod = moduleForPath(path);
  if (!grouped[mod]) grouped[mod] = [];
  grouped[mod].push(chunk);
}

const header = `import type { Response, Request } from "express";
import { z } from "zod";
import { pricing } from "../config.js";
import { config } from "../config.js";
import { parseWithVerifierFallback } from "../lib/parse-with-verifier-fallback.js";
import { mergeCompatibleProbeInput } from "../lib/apply-verifier-body.js";
import { guardBodySchema, policySchema, verifierFallback } from "./schemas.js";
import { createGet, createPost, withRequestHeaders, type RouteContext } from "./shared.js";

`;

mkdirSync(join(root, "src/routes"), { recursive: true });

for (const [mod, chunks] of Object.entries(grouped)) {
  const fn = `export function register${mod.charAt(0).toUpperCase() + mod.slice(1)}Routes(ctx: RouteContext): void {
  const post = createPost(ctx);
`;
  const content =
    header +
    fn +
    chunks.join("\n\n") +
    "\n}\n";
  writeFileSync(join(root, `src/routes/${mod}.ts`), content, "utf8");
  console.log(`wrote ${mod}.ts (${chunks.length} routes)`);
}

console.log("Done. Manual import fixes per module still required.");
