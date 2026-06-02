import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
}

function secretsMatch(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"));
  } catch {
    return false;
  }
}

/** Require WEBHOOK_ADMIN_SECRET in production for webhook management routes. */
export function requireWebhookAdmin(req: Request, res: Response): boolean {
  if (!isProduction()) return true;
  const secret = config.webhookAdminSecret;
  if (!secret) {
    res.status(503).json({
      error: "Webhook management disabled — set WEBHOOK_ADMIN_SECRET in production",
    });
    return false;
  }
  const raw = req.headers["x-webhook-admin-secret"];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (typeof provided !== "string" || !secretsMatch(secret, provided)) {
    res.status(403).json({ error: "Forbidden — invalid X-Webhook-Admin-Secret" });
    return false;
  }
  return true;
}
