/**
 * Production probes — writes scripts/probe-production-result.json
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const origin = process.env.ORIGIN ?? "https://x402-agent-suite-production.up.railway.app";
const out = join(dirname(fileURLToPath(import.meta.url)), "probe-production-result.json");

async function probe() {
  const result = { origin, at: new Date().toISOString(), checks: {} };

  const rootRes = await fetch(origin + "/");
  result.checks.root = {
    status: rootRes.status,
    x402gleVerify: rootRes.headers.get("x-x402gle-verify"),
    gitCommit: (await rootRes.json().catch(() => null))?.gitCommit ?? null,
  };

  const healthRes = await fetch(origin + "/health");
  const health = await healthRes.json().catch(() => ({}));
  result.checks.health = {
    status: healthRes.status,
    gitCommit: health.gitCommit ?? null,
    agenticReady: health.agenticReady,
    agentCashReady: health.agentCashDiscovery?.ready,
  };

  const proxyRes = await fetch(origin + "/api/x402/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const proxyText = await proxyRes.text();
  let proxyJson = null;
  try {
    proxyJson = JSON.parse(proxyText);
  } catch {
    proxyJson = { raw: proxyText.slice(0, 500) };
  }
  result.checks.proxyEmptyBody = {
    status: proxyRes.status,
    is402: proxyRes.status === 402,
    hasAccepts: Boolean(proxyJson?.accepts ?? proxyJson?.paymentRequired),
    bodyPreview: typeof proxyJson === "object" ? Object.keys(proxyJson) : proxyText.slice(0, 200),
  };

  const guardRes = await fetch(origin + "/api/guard/pre-x402", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  result.checks.guardEmptyBody = { status: guardRes.status, is402: guardRes.status === 402 };

  const wk = await fetch(origin + "/.well-known/x402");
  const wkJson = await wk.json().catch(() => null);
  result.checks.wellKnown = {
    status: wk.status,
    resourceCount: Array.isArray(wkJson?.resources) ? wkJson.resources.length : null,
  };

  writeFileSync(out, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log("\nWrote", out);
}

probe().catch((e) => {
  console.error(e);
  process.exit(1);
});
