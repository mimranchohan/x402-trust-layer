/**
 * x402gle agent.md — audition each paid route by full URL (immediate paid score per route).
 * Whole-origin audition only registers routes as pending; per-URL audition scores them.
 *
 * Usage:
 *   npx tsx scripts/run-x402gle-all-endpoints.ts [origin] [--only-missing] [--limit N] [--delay-ms MS]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAuditionBatch } from "./lib/opendexter-audition.js";

const argv = process.argv.slice(2);
let origin = "https://x402trustlayer.xyz";
let onlyMissing = false;
let limit: number | undefined;
let delayMs: number | undefined;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--only-missing") onlyMissing = true;
  else if (a === "--limit" && argv[i + 1]) limit = Number(argv[++i]);
  else if (a === "--delay-ms" && argv[i + 1]) delayMs = Number(argv[++i]);
  else if (!a.startsWith("-")) origin = a.trim();
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const openapi = JSON.parse(readFileSync(path.join(root, "openapi.json"), "utf8")) as {
  paths: Record<string, Record<string, unknown>>;
};

let paths = Object.keys(openapi.paths).filter((p) => {
  const op = openapi.paths[p]?.post ?? openapi.paths[p]?.get;
  return op && typeof op === "object" && "x-payment-info" in op;
});

if (onlyMissing) {
  const skills = (await fetch(
    `https://x402gle.com/servers/${new URL(origin).hostname}/skills.json`,
  ).then((r) => r.json())) as { skills?: Array<{ resource_url?: string; quality_score?: number }> };
  const listed = new Set(
    (skills.skills ?? [])
      .map((s) => {
        try {
          return new URL(String(s.resource_url)).pathname;
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
  paths = paths.filter((p) => !listed.has(p));
}

if (limit != null && limit > 0) paths = paths.slice(0, limit);

const delay = delayMs ?? Number(process.env.AUDITION_DELAY_MS ?? 10_000);
const outPath = path.join(root, "x402gle-all-endpoints-audition.json");

console.log(`Per-endpoint audition: ${paths.length} route(s) on ${origin}`);
console.log(`Delay: ${delay}ms\n`);

const routes = paths.map((routePath) => ({ path: routePath, url: `${origin}${routePath}` }));

const results = await runAuditionBatch(routes, {
  delayMs: delay,
  cwd: root,
  onRouteStart: (routePath, index, total) => {
    console.log(`[${index + 1}/${total}] ${routePath}`);
  },
});

let cooldown = false;
const parsedResults: Array<Record<string, unknown>> = [];

for (const r of results) {
  if (r.error === "cooldown_active") {
    cooldown = true;
    console.log(`  cooldown_active — stop (retry in ~24h or use x402gle Test now)`);
    parsedResults.push({ path: r.path, error: "cooldown_active" });
    break;
  }
  const detail: Record<string, unknown> = {
    path: r.path,
    ok: r.ok,
    score: r.score,
    status: r.status,
    exitCode: r.exitCode,
    error: r.error,
  };
  console.log(
    `  → status=${r.status ?? "?"} score=${r.score ?? "?"}${r.ok ? " PASS" : r.error ? ` ${r.error}` : " FAIL"}`,
  );
  parsedResults.push(detail);
}

const needFix = parsedResults.filter(
  (r) =>
    r.error ||
    (typeof r.score === "number" && r.score < 75) ||
    (r.status && r.status !== "pass"),
);

writeFileSync(
  outPath,
  JSON.stringify(
    {
      origin,
      onlyMissing,
      delayMs: delay,
      cooldown,
      needFixCount: needFix.length,
      results: parsedResults,
      at: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(`\nWrote ${outPath}`);
console.log(`Need fix: ${needFix.length} / ${parsedResults.length}`);

if (cooldown) process.exit(2);
process.exit(needFix.length > 0 ? 1 : 0);
