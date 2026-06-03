import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import type { Express as ExpressType } from "express";
import { idempotencyCapture, idempotencyPreCheck } from "../lib/idempotency.js";

export type PaidMw = ReturnType<typeof import("@dexterai/x402/server").x402Middleware>;
export type PaidFn = (amount: string, description: string) => PaidMw;
export type AsyncRoute = (
  handler: (req: Request, res: Response) => Promise<void>,
) => (req: Request, res: Response, next: NextFunction) => void;

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "payment-signature",
  "cookie",
  "x-api-key",
  "x-payment",
  "x402-payment",
]);

export function withRequestHeaders<T extends Record<string, unknown>>(
  body: T,
  req: Request,
): T & { requestHeaders: Record<string, unknown> } {
  const safe = Object.fromEntries(
    Object.entries(req.headers).filter(([k]) => !SENSITIVE_HEADERS.has(k.toLowerCase())),
  );
  return { ...body, requestHeaders: safe };
}

export type RouteContext = {
  app: ExpressType;
  paid: PaidFn;
  asyncRoute: AsyncRoute;
  postHandlers: Map<string, RequestHandler>;
};

export function createPost(ctx: RouteContext) {
  return (
    path: string,
    amount: string | number,
    description: string,
    handler: (req: Request, res: Response) => Promise<void>,
  ) => {
    const core = ctx.asyncRoute(handler);
    ctx.app.post(
      path,
      idempotencyPreCheck,
      ctx.paid(String(amount), description),
      idempotencyCapture,
      core,
    );
    ctx.postHandlers.set(path, core);
  };
}
