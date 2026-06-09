/**
 * x402gle paid auditions for Trust Layer v2 flagship routes (one URL at a time).
 * Usage: npx tsx scripts/run-x402gle-audition-v2.ts [origin]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAuditionBatch } from "./lib/opendexter-audition.js";

const origin = (process.argv[2]?.trim() || "https://x402trustlayer.xyz").replace(/\/$/, "");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "x402gle-v2-audition-result.json");

const v2Paths = [
  "/api/pipeline/trust-v2",
  "/api/quality-escrow/semantic-settle",
  "/api/mandate/diff",
];

const routes = v2Paths.map((p) => ({ path: p, url: `${origin}${p}` }));

console.log(`Auditioning ${v2Paths.length} v2 routes on ${origin}\n`);

const batch = await runAuditionBatch(routes, {
  cwd: root,
  delayMs: Number(process.env.AUDITION_DELAY_MS ?? 8_000),
  onRouteStart: (routePath) => console.log(`--- ${routePath} ---`),
});

const results = batch.map((r) => ({
  path: r.path,
  url: `${origin}${r.path}`,
  ok: r.ok,
  score: r.score,
  status: r.status,
  error: r.error,
}));

for (const r of results) {
  console.log(`${r.path}: score=${r.score ?? "?"} status=${r.status ?? r.error ?? "?"}\n`);
}

const summary = {
  origin,
  generatedAt: new Date().toISOString(),
  passCount: results.filter((r) => r.ok).length,
  total: results.length,
  results,
};

writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Pass: ${summary.passCount}/${summary.total}`);

const cooldown = results.every((r) => r.error === "cooldown_active");
if (cooldown) {
  console.log("\nAll routes on cooldown — use https://x402gle.com/servers/x402trustlayer.xyz Test now per route.");
  process.exit(2);
}
process.exit(summary.passCount === summary.total ? 0 : 1);
