/**
 * Production probes — writes scripts/probe-production-result.json
 * Run: npm run probe:production
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const origin = (process.env.ORIGIN ?? "https://x402trustlayer.xyz").replace(/\/$/, "");
const out = join(dirname(fileURLToPath(import.meta.url)), "probe-production-result.json");

async function loadPostRoutes() {
  const res = await fetch(`${origin}/openapi.json`);
  const openapi = await res.json().catch(() => ({}));
  const paths = openapi.paths ?? {};
  return Object.entries(paths)
    .filter(([, methods]) => methods?.post)
    .map(([p]) => p)
    .sort();
}

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
  const POST_ROUTES = await loadPostRoutes();
  const expectedPaidRoutes = POST_ROUTES.length;

  const result = {
    origin,
    at: new Date().toISOString(),
    expectedPaidRoutes,
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

  const openapiRes = await fetch(`${origin}/openapi.json`);
  const openapi = await openapiRes.json().catch(() => ({}));
  const pathCount = openapi.paths ? Object.keys(openapi.paths).length : 0;

  const endpointCount = health.endpointCount ?? expectedPaidRoutes;
  result.checks.wellKnown = {
    status: wk.status,
    resourceCount: resources.length,
    syncOk: resources.length === endpointCount,
    ownershipProofs: wkJson?.ownershipProofs?.length ?? 0,
  };
  result.checks.openapi = {
    status: openapiRes.status,
    pathCount,
    postRouteCount: expectedPaidRoutes,
    hasHealth: Boolean(openapi.paths?.["/health"]),
    hasGuidance: Boolean(openapi.info?.["x-guidance"]),
  };

  for (const path of POST_ROUTES) {
    result.routes.push(await probePost(path));
  }

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
