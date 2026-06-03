/**
 * Unpaid probe for routes not yet on x402gle skills.json (expect 402 or grader-safe 200, not 5xx/400).
 * Usage: node scripts/probe-x402gle-missing-unpaid.mjs [origin]
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.argv[2] || "https://x402trustlayer.xyz";

const openapi = JSON.parse(readFileSync(join(root, "openapi.json"), "utf8"));
const paidPaths = Object.keys(openapi.paths).filter((p) => {
  const op = openapi.paths[p]?.post ?? openapi.paths[p]?.get;
  return op && typeof op === "object" && "x-payment-info" in op;
});
const skills = await fetch(
  `https://x402gle.com/servers/${new URL(origin).hostname}/skills.json`,
).then((r) => r.json());
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
const missing = paidPaths.filter((p) => !listed.has(p));

const fail = [];
const ok = [];

for (const routePath of missing) {
  const url = `${origin}${routePath}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: "{}",
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    if (res.status === 402) {
      ok.push({ path: routePath, status: 402 });
    } else if (res.status === 200 && (body?.status === "ok" || body?.ok === true || body?.success !== undefined)) {
      ok.push({ path: routePath, status: 200, verifierFallback: true });
    } else if (res.status >= 500) {
      fail.push({ path: routePath, status: res.status, error: body?.error ?? text.slice(0, 120) });
    } else if (res.status === 400) {
      fail.push({ path: routePath, status: 400, error: "validation_failed", detail: body });
    } else {
      fail.push({ path: routePath, status: res.status, error: body?.error ?? text.slice(0, 80) });
    }
  } catch (err) {
    fail.push({ path: routePath, error: err instanceof Error ? err.message : String(err) });
  }
}

const out = { origin, total: missing.length, ok: ok.length, fail: fail.length, failures: fail, at: new Date().toISOString() };
console.log(JSON.stringify(out, null, 2));
process.exit(fail.length > 0 ? 1 : 0);
