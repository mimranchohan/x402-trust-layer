import type { Express, Request, Response } from "express";
import { listEndpoints } from "../routes.js";

type PaidFn = (amount: string, description: string) => import("express").RequestHandler;

/** Agentic / Bazaar crawlers often use GET or HEAD; some add a trailing slash. */
export function stripTrailingSlash(req: Request, _res: Response, next: () => void): void {
  if (req.path.length > 1 && req.path.endsWith("/")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    req.url = req.path.slice(0, -1) + query;
  }
  next();
}

export function registerAgenticProbes(app: Express, paid: PaidFn): void {
  for (const ep of listEndpoints()) {
    const [method, path] = ep.path.split(" ");
    if (method !== "POST") continue;
    const amount = ep.price.replace(/^\$/, "");
    const description = `x402 discovery probe for ${path} — POST for full response`;
    const paidMw = paid(amount, description);

    const okHandler = (_req: Request, res: Response) => {
      res.json({
        ok: true,
        endpoint: path,
        method: "POST",
        version: "3.0.0",
        hint: "Paid probe passed. Send POST with JSON body for full agent response.",
      });
    };

    app.get(path, paidMw, okHandler);
    app.head(path, paidMw, (_req, res) => {
      if (!res.headersSent) res.status(200).end();
    });
  }
}
