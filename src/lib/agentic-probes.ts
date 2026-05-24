import type { Express, NextFunction, Request, Response } from "express";
import { listEndpoints } from "../routes.js";
import { applyVerifierExampleBody } from "./apply-verifier-body.js";
import { markX402PaidForInternalPost } from "./x402-paid.js";

type PaidFn = (amount: string, description: string) => import("express").RequestHandler;

/** Agentic / Bazaar crawlers often use GET or HEAD; some add a trailing slash. */
export function stripTrailingSlash(req: Request, _res: Response, next: () => void): void {
  if (req.path.length > 1 && req.path.endsWith("/")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    req.url = req.path.slice(0, -1) + query;
  }
  next();
}

/**
 * x402gle/Dexter often pay for GET after 402. Re-dispatch as POST with canonical example body
 * so verifiers get full agent JSON — not the old "Send POST with JSON" stub.
 * Payment is verified on GET; POST stack skips a second settle via markX402PaidForInternalPost.
 */
function invokePaidProbeAsPost(app: Express, saveMethod: "GET" | "HEAD") {
  return (req: Request, res: Response, next: NextFunction): void => {
    applyVerifierExampleBody(req);

    const origJson = res.json.bind(res);
    if (saveMethod === "HEAD") {
      res.json = (() => {
        res.status(200);
        res.end();
        return res;
      }) as typeof res.json;
    }

    const prevMethod = req.method;
    markX402PaidForInternalPost(req);
    req.method = "POST";

    app.handle(req, res, (err: unknown) => {
      req.method = prevMethod;
      if (saveMethod === "HEAD") {
        res.json = origJson;
      }
      if (err) {
        next(err);
        return;
      }
      if (!res.headersSent) {
        next();
      }
    });
  };
}

export function registerAgenticProbes(app: Express, paid: PaidFn): void {
  for (const ep of listEndpoints()) {
    const [listedMethod, path] = ep.path.split(" ");
    // Native GET routes (e.g. attestation registry) are registered in routes.ts — do not duplicate
    if (listedMethod === "GET") continue;

    const amount = ep.price.replace(/^\$/, "");
    const description = `x402 paid probe for ${path} — GET/HEAD returns same JSON as POST`;
    const paidMw = paid(amount, description);

    app.get(path, paidMw, invokePaidProbeAsPost(app, "GET"));
    app.head(path, paidMw, invokePaidProbeAsPost(app, "HEAD"));
  }
}
