/**
 * Audition paid routes listed in OpenAPI but not yet on x402gle skills.json.
 * Usage: npx tsx scripts/run-x402gle-missing-routes.ts [origin] [--limit N] [--delay-ms MS]
 *
 * Windows: uses sequential spawn + delay (default 8s) — avoids libuv UV_HANDLE_CLOSING crashes
 * from rapid `execSync` + `npx` loops. Override: set AUDITION_DELAY_MS=12000
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAuditionBatch } from "./lib/opendexter-audition.js";

const argv = process.argv.slice(2);
let origin = "https://x402trustlayer.xyz";
let limit: number | undefined;
let delayMs: number | undefined;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--limit" && argv[i + 1]) {
    limit = Number(argv[++i]);
  } else if (a === "--delay-ms" && argv[i + 1]) {
    delayMs = Number(argv[++i]);
  } else if (!a.startsWith("-")) {
    origin = a.trim();
  }
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const openapi = JSON.parse(readFileSync(path.join(root, "openapi.json"), "utf8")) as {
  paths: Record<string, Record<string, unknown>>;
};

const paidPaths = Object.keys(openapi.paths).filter((p) => {
  const op = openapi.paths[p]?.post ?? openapi.paths[p]?.get;
  return op && typeof op === "object" && "x-payment-info" in (op as object);
});

let listed = new Set<string>();
try {
  const skills = (await fetch(
    `https://x402gle.com/servers/${new URL(origin).hostname}/skills.json`,
  ).then((r) => r.json())) as { skills?: Array<{ resource_url?: string }> };
  listed = new Set(
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
} catch {
  console.warn("Could not fetch skills.json — auditioning all paid paths from openapi.json");
}

let missing = paidPaths.filter((p) => !listed.has(p));
if (limit != null && limit > 0) missing = missing.slice(0, limit);

const outPath = path.join(root, "x402gle-missing-audition.json");
const delay = delayMs ?? Number(process.env.AUDITION_DELAY_MS ?? 8_000);

console.log(`Origin ${origin}: ${missing.length} route(s) to audition`);
console.log(`Delay between routes: ${delay}ms (Windows-safe sequential spawn)\n`);

const routes = missing.map((routePath) => ({ path: routePath, url: `${origin}${routePath}` }));

const results = await runAuditionBatch(routes, {
  delayMs: delay,
  cwd: root,
  onRouteStart: (routePath, index, total) => {
    console.log(`[${index + 1}/${total}] Audition ${routePath} ...`);
  },
});

for (const r of results) {
  if (r.error === "cooldown_active") {
    console.log(`  ${r.path}: cooldown_active — stop batch; retry later or x402gle Test now`);
    break;
  }
  if (r.ok) {
    console.log(`  ${r.path}: pass score=${r.score}`);
  } else if (r.score != null || r.status) {
    console.log(`  ${r.path}: status=${r.status ?? "?"} score=${r.score ?? "?"}`);
  } else {
    console.log(`  ${r.path}: ${r.error ?? "failed"}${r.exitCode != null ? ` (exit ${r.exitCode})` : ""}`);
  }
}

writeFileSync(
  outPath,
  JSON.stringify({ origin, missing, delayMs: delay, results, at: new Date().toISOString() }, null, 2),
);
console.log(`\nWrote ${outPath}`);

const needFix = results.filter((r) => !r.ok);
process.exit(needFix.length > 0 ? 1 : 0);
