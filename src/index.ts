import express, { type Request, type Response, type NextFunction } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertConfig, config } from "./config.js";
import { createPaidMiddleware } from "./lib/x402-paid.js";
import {
  buildDiscoverCatalog,
  buildServicesManifest,
  buildWellKnownX402,
} from "./lib/bazaar.js";
import { buildAgentCashOpenApi, buildWellKnownX402Resources } from "./lib/openapi-agentcash.js";
import { renderDiscoveryPage } from "./lib/discovery-page.js";
import { applyVerifierExampleBody } from "./lib/apply-verifier-body.js";
import { registerAgenticProbes, stripTrailingSlash } from "./lib/agentic-probes.js";
import { KILLER_SELLER_ENDPOINTS, PRIMARY_ENTRYPOINTS } from "./lib/suite-catalog.js";
import { listEndpoints, registerRoutes } from "./routes.js";
import { registerX402gleHostVerification } from "./lib/x402gle-host-verify.js";
import { SUITE_VERSION } from "./lib/version.js";
import { rateLimitPerMinute, rateLimitUnpaidProbes } from "./lib/rate-limit.js";

assertConfig();

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
registerX402gleHostVerification(app);
app.use(stripTrailingSlash);
app.use(express.json({ limit: "512kb" }));
/** Unpaid probes → 402 (x402scan). Paid retries capped separately. */
app.use("/api", rateLimitUnpaidProbes(Number(process.env.RATE_LIMIT_UNPAID_PER_MIN ?? 600)));
app.use("/api", rateLimitPerMinute(Number(process.env.RATE_LIMIT_PER_MIN ?? 120)));

/** Canonical example bodies for x402gle / Dexter AI verifier (empty or partial POST) */
app.use("/api", (req, _res, next) => {
  applyVerifierExampleBody(req);
  next();
});

/** Trust Layer brand landing page — served to browsers at `/`; machines still get JSON. */
let LANDING_HTML = "";
try {
  LANDING_HTML = readFileSync(join(process.cwd(), "public", "index.html"), "utf8");
} catch {
  LANDING_HTML = "";
}

/** Static public files (landing.js, data, assets). index.html served via GET / negotiation. */
app.use(
  express.static(join(process.cwd(), "public"), {
    index: false,
    maxAge: "1h",
  }),
);

const paid = createPaidMiddleware();

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

function healthPayload() {
  return {
    ok: true,
    service: "x402-trust-layer",
    version: SUITE_VERSION,
    chains: config.chains,
    networks: config.networks,
    endpointCount: listEndpoints().length,
    gitCommit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    agenticGetProbes: true,
    agenticReady:
      config.publicBaseUrl.startsWith("https://") &&
      config.chains.includes("base") &&
      config.payToEvm.length > 0,
    agenticHint: !config.payToEvm
      ? "Set PAY_TO_EVM + NETWORKS=base,solana on Railway for agentic.market"
      : config.publicBaseUrl.includes("railway.app") &&
          !process.env.PUBLIC_BASE_URL &&
          !process.env.CANONICAL_PUBLIC_URL
        ? `Set PUBLIC_BASE_URL=${config.canonicalOrigin} so discovery URLs match x402trustlayer.xyz`
        : null,
    agentCashDiscovery: {
      openapi: `${config.publicBaseUrl}/openapi.json`,
      wellKnown: `${config.publicBaseUrl}/.well-known/x402`,
      ready:
        config.publicBaseUrl.startsWith("https://") && config.payToEvm.length > 0,
    },
  };
}

app.get("/llms.txt", (_req, res) => {
  try {
    const txt = readFileSync(join(process.cwd(), "public", "llms.txt"), "utf8");
    res.type("text/plain").send(txt);
  } catch {
    res.status(404).type("text/plain").send("llms.txt not found");
  }
});

app.get("/health", (_req, res) => {
  res.json(healthPayload());
});

// Compatibility aliases used by some external quality probes.
app.get("/api/health", (_req, res) => {
  res.json(healthPayload());
});

app.get("/api/version", (_req, res) => {
  res.json({ service: "x402-agent-suite-pro", version: SUITE_VERSION });
});

app.get("/api/agents", (_req, res) => {
  res.json({
    count: listEndpoints().length,
    endpoints: listEndpoints(),
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json(buildAgentCashOpenApi());
});

/** AgentCash / x402scan discovery fan-out (canonical path) */
app.get("/.well-known/x402", (_req, res) => {
  res.json(buildWellKnownX402Resources());
});

app.get("/.well-known/x402.json", (_req, res) => {
  res.json(buildWellKnownX402());
});

/** Human-friendly discovery view (landing page links here instead of raw JSON path). */
app.get("/discovery", (_req, res) => {
  res.type("html").send(renderDiscoveryPage(buildWellKnownX402Resources(), config.publicBaseUrl));
});

/** Same manifest as /.well-known/x402 — safe path for browsers (Chrome may flag .well-known). */
app.get("/discovery.json", (_req, res) => {
  res.json(buildWellKnownX402Resources());
});

app.get("/x402/api/services.json", (_req, res) => {
  res.json(buildServicesManifest());
});

function sendDiscoverCatalog(_req: Request, res: Response): void {
  res.json(buildDiscoverCatalog());
}

app.get("/x402/api/discover", sendDiscoverCatalog);
/** Redirects — canonical path is /x402/api/discover */
app.get("/x402/discover", (_req, res) => res.redirect(301, "/x402/api/discover"));
app.get("/discover", (_req, res) => res.redirect(301, "/x402/api/discover"));

app.get("/", (req, res) => {
  const acceptsHtml = (req.headers.accept ?? "").includes("text/html");
  if (acceptsHtml && LANDING_HTML) {
    res.type("html").send(LANDING_HTML);
    return;
  }
  const all = listEndpoints();
  res.json({
    name: "x402 Trust Layer — Agent Suite",
    description:
      "31 paid x402 infrastructure APIs — start with 3 entry points; 26 advanced routes incl. 7 Tier-1 enterprise agents",
    docs: `${config.publicBaseUrl}/openapi.json`,
    discovery: `${config.publicBaseUrl}/x402/api/discover`,
    bazaar: `${config.publicBaseUrl}/x402/api/services.json`,
    agenticMarket: "https://agentic.market/",
    agentCash: "https://agentcash.dev/",
    x402scanRegister: "https://www.x402scan.com/resources/register",
    dexterSeller: `https://dexter.cash/sellers/${config.payTo}`,
    pipeline: `${config.publicBaseUrl}/api/pipeline/full`,
    onboarding: {
      primary: PRIMARY_ENTRYPOINTS,
      killerSeller: KILLER_SELLER_ENDPOINTS,
      advancedCount: all.length - PRIMARY_ENTRYPOINTS.length - KILLER_SELLER_ENDPOINTS.length,
    },
    endpoints: all,
  });
});

const postHandlers = registerRoutes(app, paid, asyncRoute);
registerAgenticProbes(app, paid, postHandlers);

/** Copy-paste URLs for Agentic Validate Endpoint (free) */
app.get("/api/agentic/validate-urls", (_req, res) => {
  const base = config.publicBaseUrl;
  res.json({
    note: "Paste these exact URLs into agentic.market Validate Endpoint. No trailing slash.",
    agenticGetProbes: true,
    urls: listEndpoints().map((e) => {
      const [, path] = e.path.split(" ");
      return `${base}${path}`;
    }),
    example: `${base}/api/x402/proxy`,
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[api error]", err);
  const expose =
    process.env.NODE_ENV !== "production" && !process.env.RAILWAY_ENVIRONMENT;
  res.status(500).json({
    error: "Internal server error",
    ...(expose && err instanceof Error ? { detail: err.message } : {}),
  });
});

const host = "0.0.0.0";
app.listen(config.port, host, () => {
  console.log(`[boot] version=${SUITE_VERSION} endpoints=${listEndpoints().length} chains=${config.chains.join(",")}`);
  console.log(`[boot] payToConfigured=${config.payTo.length > 0} git=${process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"}`);
  console.log(`x402 Agent Suite Pro listening on http://127.0.0.1:${config.port}`);
  console.log(`public=${config.publicBaseUrl}`);
});

process.on("uncaughtException", (err) => {
  console.error("[fatal]", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});
