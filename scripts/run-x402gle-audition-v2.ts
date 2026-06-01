/**
 * x402gle paid auditions for Trust Layer v2 flagship routes (one URL at a time).
 * Usage: npx tsx scripts/run-x402gle-audition-v2.ts [origin]
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const origin = (process.argv[2]?.trim() || "https://x402trustlayer.xyz").replace(/\/$/, "");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "x402gle-v2-audition-result.json");

const v2Paths = [
  "/api/pipeline/trust-v2",
  "/api/quality-escrow/semantic-settle",
  "/api/mandate/diff",
];

type RouteResult = {
  path: string;
  url: string;
  ok: boolean;
  score?: number;
  status?: string;
  shareUrl?: string;
  verdict?: string;
  error?: string;
};

const results: RouteResult[] = [];

console.log(`Auditioning ${v2Paths.length} v2 routes on ${origin}\n`);

for (const p of v2Paths) {
  const url = `${origin}${p}`;
  console.log(`--- ${p} ---`);
  try {
    const run = spawnSync(
      "npx",
      ["-y", "@dexterai/opendexter@latest", "audition", url, "--json"],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, cwd: root, shell: process.platform === "win32" },
    );
    const raw = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < jsonStart) {
      throw new Error(raw.slice(0, 400) || `exit ${run.status}`);
    }
    const data = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
      routes?: {
        score?: number;
        status?: string;
        shareUrl?: string;
        verdict?: string;
      }[];
      error?: string;
    };
    if (data.error === "cooldown_active") {
      results.push({ path: p, url, ok: false, error: "cooldown_active" });
      console.log("cooldown_active — skip or use x402gle UI Test now\n");
      continue;
    }
    const route = data.routes?.[0];
    const pass = route?.status === "pass" && (route?.score ?? 0) >= 75;
    results.push({
      path: p,
      url,
      ok: pass,
      score: route?.score,
      status: route?.status,
      shareUrl: route?.shareUrl,
      verdict: route?.verdict,
    });
    console.log(`score=${route?.score ?? "?"} status=${route?.status ?? "?"}`);
    if (route?.shareUrl) console.log(route.shareUrl);
    console.log("");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ path: p, url, ok: false, error: msg.slice(0, 500) });
    console.error(msg.slice(0, 300), "\n");
  }
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
