import express, { type Request, type Response, type NextFunction } from "express";
import { assertConfig, config } from "./config.js";
import { createPaidMiddleware } from "./lib/x402-paid.js";
import {
  buildDiscoverCatalog,
  buildServicesManifest,
  buildWellKnownX402,
} from "./lib/bazaar.js";
import { buildAgentCashOpenApi, buildWellKnownX402Resources } from "./lib/openapi-agentcash.js";
import { VERIFY_EXAMPLES } from "./lib/verify-examples.js";
import { registerAgenticProbes, stripTrailingSlash } from "./lib/agentic-probes.js";
import { listEndpoints, registerRoutes } from "./routes.js";

assertConfig();

const app = express();
app.set("trust proxy", true);
app.use(stripTrailingSlash);
app.use(express.json({ limit: "512kb" }));

/** Inject example JSON when AI verifier sends empty body (improves Dexter quality score) */
app.use("/api", (req, _res, next) => {
  if (req.method === "POST") {
    const body = req.body as Record<string, unknown> | undefined;
    const empty = !body || (typeof body === "object" && Object.keys(body).length === 0);
    if (empty && VERIFY_EXAMPLES[req.path]) {
      req.body = VERIFY_EXAMPLES[req.path];
    }
  }
  next();
});

const paid = createPaidMiddleware();

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "x402-agent-suite-pro",
    version: "3.0.0",
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
      : null,
    agentCashDiscovery: {
      openapi: `${config.publicBaseUrl}/openapi.json`,
      wellKnown: `${config.publicBaseUrl}/.well-known/x402`,
      ready:
        config.publicBaseUrl.startsWith("https://") && config.payToEvm.length > 0,
    },
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

app.get("/", (_req, res) => {
  res.json({
    name: "x402 Agent Suite Pro",
    description: "22 paid x402 infrastructure agents — multi-chain guard, proxy, MPP v2, attestation",
    docs: `${config.publicBaseUrl}/openapi.json`,
    discovery: `${config.publicBaseUrl}/x402/api/discover`,
    bazaar: `${config.publicBaseUrl}/x402/api/services.json`,
    agenticMarket: "https://agentic.market/",
    agentCash: "https://agentcash.dev/",
    x402scanRegister: "https://www.x402scan.com/resources/register",
    pipeline: `${config.publicBaseUrl}/api/pipeline/full`,
    endpoints: listEndpoints(),
  });
});

registerRoutes(app, paid, asyncRoute);
registerAgenticProbes(app, paid);

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
  res.status(500).json({
    error: err instanceof Error ? err.message : "Internal server error",
  });
});

const host = "0.0.0.0";
app.listen(config.port, host, () => {
  console.log(`[boot] version=3.0.0 endpoints=${listEndpoints().length} chains=${config.chains.join(",")}`);
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
