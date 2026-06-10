import type { Express, Request, Response, RequestHandler } from "express";
import { listEndpoints } from "../routes.js";
import { applyVerifierExampleBody } from "./apply-verifier-body.js";

type PaidFn = (amount: string, description: string) => import("express").RequestHandler;

/** Agentic / Bazaar crawlers often use GET or HEAD; some add a trailing slash. */
export function stripTrailingSlash(req: Request, _res: Response, next: () => void): void {
  if (req.path.length > 1 && req.path.endsWith("/")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    req.url = req.path.slice(0, -1) + query;
  }
  next();
}

function headWrap(core: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const origJson = res.json.bind(res);
    res.json = ((body?: unknown) => {
      res.status(200);
      res.end();
      return res;
    }) as typeof res.json;
    core(req, res, (err) => {
      res.json = origJson;
      next(err);
    });
  };
}

function paidGetProbe(core: RequestHandler): RequestHandler {
  return (req, res, next) => {
    applyVerifierExampleBody(req);
    core(req, res, next);
  };
}

/**
 * Agentic / Bazaar crawlers often pay for GET after 402.
 * Mount the same core handler as POST (payment verified on GET only).
 */
export function registerAgenticProbes(
  app: Express,
  paid: PaidFn,
  postHandlers: Map<string, RequestHandler>,
): void {
  for (const ep of listEndpoints()) {
    const [listedMethod, path] = ep.path.split(" ");
    if (listedMethod === "GET") continue;

    const core = postHandlers.get(path);
    if (!core) continue;

    const amount = ep.price.replace(/^\$/, "");
    // Skip free or non-numeric prices - they have no x402 gate
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) continue;

    const description = "x402 probe: " + path;
    const paidMw = paid(amount, description);

    app.get(path, paidMw, paidGetProbe(core));
    app.head(path, paidMw, headWrap(paidGetProbe(core)));
  }
}
