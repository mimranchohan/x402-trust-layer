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
  const args = ["-y", "@dexterai/opendexter@latest", "fetch", url, "--json"];
  if (method !== "GET") args.splice(args.length - 1, 0, "--method", method);

  const proc = spawnSync("npx", args, {
    encoding: "utf8",
    shell: true,
    timeout: 120_000,
    env: process.env,
  });

  const raw = (proc.stdout ?? "") + (proc.stderr ?? "");
  let parsed = null;
  try {
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) parsed = JSON.parse(raw.slice(jsonStart));
  } catch {
    parsed = null;
  }

  const settled = parsed?.payment?.settled === true || parsed?.payment?.details?.success === true;
  const tx = parsed?.payment?.details?.transaction ?? null;
  const status = parsed?.status ?? proc.status;
  const err = parsed?.error ?? (proc.status !== 0 && !settled ? raw.slice(0, 200) : null);

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
