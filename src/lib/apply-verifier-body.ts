import type { Request } from "express";
import { VERIFY_EXAMPLES } from "./verify-examples.js";

/** Merge canonical bodies so x402gle / Dexter paid probes get 200 instead of 400 */
export function applyVerifierExampleBody(req: Request): void {
  if (req.method !== "POST") return;
  const example = VERIFY_EXAMPLES[req.path];
  if (!example || typeof example !== "object" || Array.isArray(example)) return;

  const ex = example as Record<string, unknown>;
  const body = req.body as Record<string, unknown> | undefined;
  const empty = !body || (typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0);

  if (empty) {
    req.body = { ...ex };
    return;
  }

  if (body && typeof body === "object" && !Array.isArray(body)) {
    const dangerous = ["targetUrl", "urls", "origin", "policy", "walletAddress", "externalCallEstimateUsdc"];
    const hasDangerous = dangerous.some((k) => k in body && body[k] !== undefined);
    req.body = hasDangerous ? { ...ex } : { ...ex, ...body };
  }
}
