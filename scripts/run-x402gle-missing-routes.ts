/**
 * Audition paid routes listed in OpenAPI but not yet on x402gle skills.json.
 * Usage: npx tsx scripts/run-x402gle-missing-routes.ts [origin]
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const origin = process.argv[2]?.trim() || "https://x402trustlayer.xyz";
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
  const skills = await fetch(`https://x402gle.com/servers/${new URL(origin).hostname}/skills.json`).then(
    (r) => r.json(),
  ) as { skills?: Array<{ resource_url?: string }> };
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
  listed = new Set();
}

const missing = paidPaths.filter((p) => !listed.has(p));
const outPath = path.join(root, "x402gle-missing-audition.json");
const results: Array<{ path: string; ok: boolean; score?: number; status?: string; error?: string }> = [];

console.log(`Origin ${origin}: ${missing.length} routes not on x402gle skills index\n`);

for (const routePath of missing) {
  const url = `${origin}${routePath}`;
  console.log(`Audition ${routePath} ...`);
  try {
    const raw = execSync(`npx -y @dexterai/opendexter@latest audition "${url}" --json`, {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      cwd: root,
    });
    const data = JSON.parse(raw) as {
      error?: string;
      routes?: Array<{ score?: number; status?: string }>;
    };
    if (data.error === "cooldown_active") {
      console.log("  cooldown_active — stop batch; retry later or use x402gle Test now per route");
      results.push({ path: routePath, ok: false, error: "cooldown_active" });
      break;
    }
    const route = data.routes?.[0];
    results.push({
      path: routePath,
      ok: route?.status === "pass" && (route?.score ?? 0) >= 75,
      score: route?.score,
      status: route?.status,
    });
    console.log(`  score=${route?.score ?? "?"} status=${route?.status ?? "?"}`);
  } catch (err) {
    results.push({ path: routePath, ok: false, error: String(err) });
    console.log(`  error: ${err}`);
  }
}

writeFileSync(outPath, JSON.stringify({ origin, missing, results, at: new Date().toISOString() }, null, 2));
console.log(`\nWrote ${outPath}`);
const needFix = results.filter((r) => !r.ok);
process.exit(needFix.length > 0 ? 1 : 0);
