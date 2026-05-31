/**
 * Pay every paid route once (GET probe) for Bazaar / x402gle settlement signal.
 * Uses OpenDexter CLI wallet (EVM_PRIVATE_KEY / DEXTER_PRIVATE_KEY in env).
 *
 * Run: node scripts/bazaar-settle-all.mjs
 * Optional: ORIGIN=https://x402trustlayer.xyz METHOD=GET node scripts/bazaar-settle-all.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const origin = (process.env.ORIGIN ?? "https://x402trustlayer.xyz").replace(/\/$/, "");
const method = (process.env.METHOD ?? "GET").toUpperCase();
const delayMs = Number(process.env.DELAY_MS ?? 2500);
const out = join(dirname(fileURLToPath(import.meta.url)), "bazaar-settle-result.json");

const catalogRes = await fetch(`${origin}/api/agentic/validate-urls`);
if (!catalogRes.ok) throw new Error(`validate-urls ${catalogRes.status}`);
const catalog = await catalogRes.json();
const urls = catalog.urls ?? [];
if (!urls.length) throw new Error("No URLs from /api/agentic/validate-urls");

const results = [];
console.log(`Settling ${urls.length} routes on ${origin} via OpenDexter (${method})…\n`);

for (const url of urls) {
  process.stdout.write(`${url} … `);
  const args = [
    "-y",
    "@dexterai/opendexter@latest",
    "fetch",
    url,
    "--method",
    method,
  ];

  const proc = spawnSync("npx", args, {
    encoding: "utf8",
    shell: true,
    timeout: 120_000,
    env: process.env,
  });

  const stdout = proc.stdout ?? "";
  const settled = /"settled"\s*:\s*true/.test(stdout);
  const tx = stdout.match(/"transaction"\s*:\s*"(0x[a-fA-F0-9]+)"/)?.[1] ?? null;
  const statusMatch = stdout.match(/"status"\s*:\s*(\d+)/);
  const status = statusMatch ? Number(statusMatch[1]) : proc.status;
  const err =
    proc.status !== 0 && !settled
      ? (proc.stderr ?? stdout).slice(0, 240)
      : null;

  results.push({ url, settled, status, tx, error: err ?? null });
  console.log(settled ? `OK tx=${tx?.slice(0, 14)}…` : `FAIL ${err ?? proc.status}`);

  await new Promise((r) => setTimeout(r, delayMs));
}

const summary = {
  origin,
  method,
  at: new Date().toISOString(),
  total: results.length,
  settled: results.filter((r) => r.settled).length,
  failed: results.filter((r) => !r.settled).length,
  results,
};
writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
console.log(`\nDone: ${summary.settled}/${summary.total} settled. Wrote ${out}`);
if (summary.failed) process.exit(1);
