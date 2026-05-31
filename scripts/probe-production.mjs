/**
 * Production probes — writes scripts/probe-production-result.json
 * Run: npm run probe:production
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const origin = (process.env.ORIGIN ?? "https://x402trustlayer.xyz").replace(
  /\/$/,
  "",
);
const out = join(dirname(fileURLToPath(import.meta.url)), "probe-production-result.json");

const POST_ROUTES = [
  "/api/market/buy-advisor",
  "/api/seller/audition-coach",
  "/api/x402/proxy",
  "/api/mpp/session",
  "/api/attestation/issue",
  "/api/attestation/verify",
  "/api/guard/pre-x402",
  "/api/pipeline/execute",
  "/api/payment-intent/compile",
  "/api/facilitator/failover",
  "/api/mpp/session-plan",
  "/api/spend-governor/check",
  "/api/identity-gate/check",
  "/api/risk-gate/scan",
  "/api/router/route",
  "/api/research/brief",
  "/api/receipt-auditor/verify",
  "/api/refund-arbiter/evaluate",
  "/api/budget-allocator/run",
  "/api/settlement-graph/next",
  "/api/quality-monitor/probe",
  "/api/evidence-locker/export",
  "/api/agent-escrow",
];

async function probePost(path) {
  const res = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const text = await res.text();
  let keys = [];
  try {
    const j = JSON.parse(text);
    keys = typeof j === "object" && j ? Object.keys(j).slice(0, 12) : [];
  } catch {
    keys = ["non-json"];
  }
  return {
    path,
    status: res.status,
    pass402: res.status === 402,
    keys,
  };
}

async function probe() {
  const result = {
    origin,
    at: new Date().toISOString(),
    expectedPaidRoutes: 24,
    checks: {},
    routes: [],
  };

  const healthRes = await fetch(`${origin}/health`);
  const health = await healthRes.json().catch(() => ({}));
  result.checks.health = {
    status: healthRes.status,
    endpointCount: health.endpointCount,
    gitCommit: health.gitCommit,
    agenticReady: health.agenticReady,
    agentCashReady: health.agentCashDiscovery?.ready,
  };

  const wk = await fetch(`${origin}/.well-known/x402`);
  const wkJson = await wk.json().catch(() => null);
  const resources = Array.isArray(wkJson?.resources) ? wkJson.resources : [];
  result.checks.wellKnown = {
    status: wk.status,
    resourceCount: resources.length,
    syncOk: resources.length === 24,
    ownershipProofs: wkJson?.ownershipProofs?.length ?? 0,
  };

  const openapiRes = await fetch(`${origin}/openapi.json`);
  const openapi = await openapiRes.json().catch(() => ({}));
  const pathCount = openapi.paths ? Object.keys(openapi.paths).length : 0;
  result.checks.openapi = {
    status: openapiRes.status,
    pathCount,
    hasHealth: Boolean(openapi.paths?.["/health"]),
    hasGuidance: Boolean(openapi.info?.["x-guidance"]),
  };

  for (const path of POST_ROUTES) {
    result.routes.push(await probePost(path));
  }
  const reg = await fetch(`${origin}/api/attestation/registry`);
  result.routes.push({
    path: "/api/attestation/registry",
    status: reg.status,
    pass402: reg.status === 402,
    keys: [],
  });

  const fail402 = result.routes.filter((r) => !r.pass402);
  result.summary = {
    total: result.routes.length,
    pass402Count: result.routes.length - fail402.length,
    fail402Paths: fail402.map((r) => r.path),
    discoveryInSync:
      result.checks.wellKnown.syncOk && !result.checks.openapi.hasHealth,
  };

  writeFileSync(out, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result.summary, null, 2));
  console.log("Wrote", out);
  if (fail402.length) process.exit(1);
}

probe().catch((e) => {
  console.error(e);
  process.exit(1);
});
