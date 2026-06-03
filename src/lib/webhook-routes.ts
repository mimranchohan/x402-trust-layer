import type { Express, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { UnsafeUrlError } from "./ssrf.js";
import {
  deactivateWebhook,
  dispatchWebhooks,
  listWebhooks,
  registerWebhook,
  type WebhookEvent,
} from "./webhooks.js";
import { requireWebhookAdmin } from "./webhook-auth.js";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
}

const eventSchema = z.enum([
  "guard.denied",
  "guard.allowed",
  "receipt.invalid",
  "spend.cap_exceeded",
  "merchant.trust_low",
]);

export function registerWebhookRoutes(app: Express): void {
  app.post("/api/webhooks/register", async (req: Request, res: Response) => {
    if (!requireWebhookAdmin(req, res)) return;
    const parsed = z
      .object({
        fleetId: z.string().min(1),
        url: z.string().url(),
        events: z.array(eventSchema).min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const sub = await registerWebhook(parsed.data);
      res.status(201).json({
        ok: true,
        subscription: {
          id: sub.id,
          fleetId: sub.fleetId,
          url: sub.url,
          events: sub.events,
          secret: sub.secret,
          createdAt: sub.createdAt,
        },
        note: "Deliveries signed with x-hub-signature-256 (HMAC-SHA256).",
      });
    } catch (err) {
      const msg = err instanceof UnsafeUrlError ? err.message : "Invalid webhook URL";
      res.status(400).json({ error: msg });
    }
  });

  app.get("/api/webhooks/list", async (req: Request, res: Response) => {
    if (!requireWebhookAdmin(req, res)) return;
    const fleetId = typeof req.query.fleetId === "string" ? req.query.fleetId : undefined;
    const subs = await listWebhooks(fleetId);
    res.json({
      ok: true,
      count: subs.length,
      subscriptions: subs.map((s) => ({
        id: s.id,
        fleetId: s.fleetId,
        url: s.url,
        events: s.events,
        createdAt: s.createdAt,
        active: s.active,
      })),
    });
  });

  app.delete("/api/webhooks/:id", async (req: Request, res: Response) => {
    if (!requireWebhookAdmin(req, res)) return;
    const fleetId = typeof req.query.fleetId === "string" ? req.query.fleetId : "";
    if (!fleetId) {
      res.status(400).json({ error: "fleetId query param required" });
      return;
    }
    const ok = await deactivateWebhook(req.params.id, fleetId);
    if (!ok) {
      res.status(404).json({ error: "Webhook not found" });
      return;
    }
    res.json({ ok: true, deactivated: req.params.id });
  });

  app.post("/api/webhooks/test-dispatch", async (req: Request, res: Response) => {
    if (isProduction()) {
      const secret = process.env.WEBHOOK_TEST_SECRET?.trim();
      const raw = req.headers["x-webhook-test-secret"];
      const provided = Array.isArray(raw) ? raw[0] : raw;
      const ok =
        secret &&
        typeof provided === "string" &&
        secret.length === provided.length &&
        timingSafeEqual(Buffer.from(secret, "utf8"), Buffer.from(provided, "utf8"));
      if (!ok) {
        res.status(403).json({ error: "Forbidden — set WEBHOOK_TEST_SECRET and X-Webhook-Test-Secret header" });
        return;
      }
    }
    const parsed = z
      .object({
        fleetId: z.string().optional(),
        event: eventSchema,
        payload: z.record(z.unknown()).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = await dispatchWebhooks(
      parsed.data.event as WebhookEvent,
      parsed.data.payload ?? { test: true },
      parsed.data.fleetId,
    );
    res.json({ ok: true, ...result });
  });
}
