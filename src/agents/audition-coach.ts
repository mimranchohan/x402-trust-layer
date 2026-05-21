import { buildBazaarExtension } from "../lib/bazaar-extension.js";
import { hostOf, probeEndpoint } from "../lib/probe.js";
import { VERIFY_EXAMPLES } from "../lib/verify-examples.js";

export type AuditionCoachInput = {
  origin: string;
  maxRoutes?: number;
};

export type RouteAudit = {
  url: string;
  method: string;
  probeStatus: number;
  requiresPayment: boolean;
  priceUsdc: number | null;
  scoreEstimate: number;
  status: "pass" | "warn" | "fail";
  issues: string[];
  fixInstructions: string[];
};

export type AuditionCoachResult = {
  origin: string;
  auditedAt: string;
  hostScoreEstimate: number;
  summary: string;
  discovery: {
    openapiOk: boolean;
    wellKnownOk: boolean;
    resourceCount: number | null;
    openapiPathCount: number | null;
  };
  globalFixes: string[];
  routes: RouteAudit[];
  nextCommands: string[];
  dexterAuditionNote: string;
};

async function fetchJson(url: string, timeoutMs = 15_000): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, data: { error: err instanceof Error ? err.message : String(err) } };
  }
}

function extractWellKnownUrls(data: unknown, origin: string): string[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const resources = record.resources;
  if (!Array.isArray(resources)) return [];
  return resources
    .map((r) => (typeof r === "string" ? r : typeof r === "object" && r && "url" in r ? String((r as { url: string }).url) : null))
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"));
}

function extractOpenApiPaidPaths(
  data: unknown,
  origin: string,
): Array<{ method: string; path: string; url: string }> {
  if (!data || typeof data !== "object") return [];
  const paths = (data as Record<string, unknown>).paths;
  if (!paths || typeof paths !== "object") return [];
  const base = origin.replace(/\/$/, "");
  const out: Array<{ method: string; path: string; url: string }> = [];
  for (const [path, methods] of Object.entries(paths as Record<string, unknown>)) {
    if (path === "/health") continue;
    if (!methods || typeof methods !== "object") continue;
    for (const method of Object.keys(methods as Record<string, unknown>)) {
      if (["get", "post", "put", "delete"].includes(method)) {
        out.push({ method: method.toUpperCase(), path, url: `${base}${path}` });
      }
    }
  }
  return out;
}

function bazaarShapeOk(path: string, method: string, example: unknown): boolean {
  const ext = buildBazaarExtension(path, method, example);
  const schema = ext.schema as Record<string, unknown>;
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props) return false;
  const inputProps = props.input as Record<string, unknown> | undefined;
  const inputInner = inputProps?.properties as Record<string, unknown> | undefined;
  const hasInput =
    Boolean(inputInner?.body) || Boolean(inputInner?.queryParams) || method === "GET";
  const outputProps = props.output as Record<string, unknown> | undefined;
  const outputInner = outputProps?.properties as Record<string, unknown> | undefined;
  const hasOutput = Boolean(outputInner?.example);
  return hasInput && hasOutput;
}

function auditRoute(url: string, method: string, isOwnSuite: boolean): Promise<RouteAudit> {
  return (async () => {
    const issues: string[] = [];
    const fixInstructions: string[] = [];
    const probeMethod = method === "GET" ? "GET" : "POST";
    const probe = await probeEndpoint(url, {
      method: probeMethod,
      body: probeMethod === "POST" ? "{}" : undefined,
    });

    let score = 50;

    if (probe.status === 402) {
      score += 25;
    } else if (probe.status === 200 && method === "POST") {
      issues.push("POST route returns 200 without payment — verifiers expect 402 or paid 200 with body");
      fixInstructions.push("Wrap route with x402 middleware; return 402 for unpaid POST.");
      score -= 15;
    } else if (probe.status === 0) {
      issues.push("Endpoint unreachable from coach probe");
      fixInstructions.push("Check Railway/deploy URL, TLS, and firewall.");
      score -= 40;
    } else {
      issues.push(`Unexpected probe status ${probe.status}`);
      fixInstructions.push("Ensure unpaid probe returns HTTP 402 with paymentOptions.");
      score -= 10;
    }

    if (probe.priceUsdc == null && probe.requiresPayment) {
      issues.push("402 missing parseable USDC price");
      fixInstructions.push("Include paymentOptions[].price per chain in 402 body.");
      score -= 10;
    } else if (probe.priceUsdc != null && probe.priceUsdc > 0) {
      score += 8;
    }

    if (!url.startsWith("https://")) {
      issues.push("Resource URL is not HTTPS");
      fixInstructions.push("Set PUBLIC_BASE_URL to https:// in production.");
      score -= 20;
    }

    const path = new URL(url).pathname;
    if (method === "POST" && isOwnSuite) {
      const example = VERIFY_EXAMPLES[path];
      if (!example) {
        issues.push("Missing VERIFY_EXAMPLES entry for verifier empty-body merge");
        fixInstructions.push(`Add canonical body to src/lib/verify-examples.ts for ${path}`);
        score -= 12;
      } else if (!bazaarShapeOk(path, method, example)) {
        issues.push("Bazaar schema shape may fail AgentCash discovery");
        fixInstructions.push(
          "Use schema.properties.input.properties.body and output.properties.example (see bazaar-extension.ts).",
        );
        score -= 15;
      } else {
        score += 10;
      }
    }

    if (probe.paymentOptions.length >= 2) score += 5;

    score = Math.max(0, Math.min(100, score));
    const status: RouteAudit["status"] = score >= 75 ? "pass" : score >= 55 ? "warn" : "fail";

    return {
      url,
      method,
      probeStatus: probe.status,
      requiresPayment: probe.requiresPayment,
      priceUsdc: probe.priceUsdc,
      scoreEstimate: score,
      status,
      issues,
      fixInstructions,
    };
  })();
}

export async function runAuditionCoach(input: AuditionCoachInput): Promise<AuditionCoachResult> {
  const origin = input.origin.replace(/\/$/, "");
  const maxRoutes = Math.min(Math.max(input.maxRoutes ?? 24, 1), 30);
  const globalFixes: string[] = [];
  const routes: RouteAudit[] = [];

  const [openapiRes, wellKnownRes, rootHead] = await Promise.all([
    fetchJson(`${origin}/openapi.json`),
    fetchJson(`${origin}/.well-known/x402`),
    fetch(`${origin}/`, { method: "HEAD" }).catch(() => null),
  ]);

  const isOwnSuite = hostOf(origin) === hostOf("https://x402-agent-suite-production.up.railway.app");

  if (!openapiRes.ok) {
    globalFixes.push("Publish GET /openapi.json with x-payment-info and requestBody examples.");
  }
  if (!wellKnownRes.ok) {
    globalFixes.push("Publish GET /.well-known/x402 listing all paid resource URLs.");
  }

  const openapiPaths = openapiRes.ok ? extractOpenApiPaidPaths(openapiRes.data, origin) : [];
  const wellKnownUrls = wellKnownRes.ok ? extractWellKnownUrls(wellKnownRes.data, origin) : [];

  if (openapiRes.ok && typeof openapiRes.data === "object") {
    const paths = (openapiRes.data as Record<string, unknown>).paths as Record<string, unknown> | undefined;
    if (paths && "/health" in paths) {
      globalFixes.push("Remove /health from OpenAPI paid paths (x402scan registers it incorrectly).");
    }
    const info = (openapiRes.data as Record<string, unknown>).info as Record<string, unknown> | undefined;
    if (!info?.["x-guidance"]) {
      globalFixes.push("Add info.x-guidance in OpenAPI for agent instructions.");
    }
  }

  const x402gleHeader = rootHead?.headers.get("x-x402gle-verify");
  if (!x402gleHeader) {
    globalFixes.push(
      "Set X402GLE_CHALLENGE_TOKEN on host and emit X-X402GLE-VERIFY header for x402gle domain claim.",
    );
  }

  if (wellKnownUrls.length && openapiPaths.length && wellKnownUrls.length !== openapiPaths.length) {
    globalFixes.push(
      `Align /.well-known/x402 (${wellKnownUrls.length} URLs) with OpenAPI paid paths (${openapiPaths.length}).`,
    );
  }

  const urlsToAudit = new Map<string, string>();
  for (const u of wellKnownUrls.slice(0, maxRoutes)) {
    urlsToAudit.set(u, u.includes("registry") ? "GET" : "POST");
  }
  for (const p of openapiPaths.slice(0, maxRoutes)) {
    const full = `${origin}${p.path}`;
    urlsToAudit.set(full, p.method);
  }

  for (const [url, method] of urlsToAudit) {
    routes.push(await auditRoute(url, method, isOwnSuite));
  }

  const avg =
    routes.length > 0 ? routes.reduce((s, r) => s + r.scoreEstimate, 0) / routes.length : 0;
  const failCount = routes.filter((r) => r.status === "fail").length;
  const hostScoreEstimate = Math.round(avg);

  const summary =
    routes.length === 0
      ? "No routes discovered — fix OpenAPI and .well-known/x402 first."
      : `${routes.length} routes audited; ~${hostScoreEstimate} avg score; ${failCount} need fixes before Dexter/x402gle pass (75+).`;

  return {
    origin,
    auditedAt: new Date().toISOString(),
    hostScoreEstimate,
    summary,
    discovery: {
      openapiOk: openapiRes.ok,
      wellKnownOk: wellKnownRes.ok,
      resourceCount: wellKnownUrls.length || null,
      openapiPathCount: openapiPaths.length || null,
    },
    globalFixes,
    routes: routes.sort((a, b) => a.scoreEstimate - b.scoreEstimate),
    nextCommands: [
      `npx -y @dexterai/opendexter@latest audition "${origin}" --json`,
      `npm run discovery:check -- ${origin}/api/x402/proxy`,
      "Fix fixInstructions per route → redeploy → re-run coach",
    ],
    dexterAuditionNote:
      "Coach is static + unpaid probes. Dexter audition runs real paid tests and updates catalog quality scores.",
  };
}
