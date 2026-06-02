import type { Request, Response, NextFunction } from "express";
import { verifyReplayBinding } from "../protocol/replay-guard.js";

/** Optional replay enforcement when client sends X-Trust-Replay-Binding */
export function replayBindingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const bindingId = String(req.headers["x-trust-replay-binding"] ?? "").trim();
  if (!bindingId) return void next();

  void verifyReplayBinding(bindingId, {
    nonce: String(req.headers["x-trust-replay-nonce"] ?? ""),
    resourceUrl: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
    requestBody: req.body,
    agentId:
      req.body && typeof req.body === "object" && "agentId" in req.body
        ? String((req.body as { agentId: unknown }).agentId)
        : undefined,
  })
    .then((result) => {
      if (!result.valid) {
        res.status(409).json({
          error: "replay_binding_invalid",
          reason: result.reason,
          bindingId,
        });
        return;
      }
      next();
    })
    .catch(next);
}
