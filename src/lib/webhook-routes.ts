import type { Express, Request, Response } from "express";
import { z } from "zod";
import { UnsafeUrlError } from "./ssrf.js";
import {
  deactivateWebhook,
  dispatchWebhooks,
  listWebhooks,
  registerWebhook,
  type WebhookEvent,
} from "./webhooks.js";

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
  app.post("/api/webhooks/register", (req: Request, res: Response) => {
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
    let sub;
    try {
      sub = registerWebhook(parsed.data);
    } catch (err) {
      const msg = err instanceof UnsafeUrlError ? err.message : "Invalid webhook URL";
      res.status(400).json({ error: msg });
      return;
    }
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
      note: "Beta — verify deliveries with X-Trust-Layer-Signature (sha256 of secret.body).",
    });
  });

  app.get("/api/webhooks/list", (req: Request, res: Response) => {
    const fleetId = typeof req.query.fleetId === "string" ? req.query.fleetId : undefined;
    res.json({
      ok: true,
      count: listWebhooks(fleetId).length,
      subscriptions: listWebhooks(fleetId).map((s) => ({
        id: s.id,
        fleetId: s.fleetId,
        url: s.url,
        events: s.events,
        createdAt: s.createdAt,
        active: s.active,
      })),
    });
  });

  app.delete("/api/webhooks/:id", (req: Request, res: Response) => {
    const fleetId = typeof req.query.fleetId === "string" ? req.query.fleetId : "";
    if (!fleetId) {
      res.status(400).json({ error: "fleetId query param required" });
      return;
    }
    const ok = deactivateWebhook(req.params.id, fleetId);
    if (!ok) {
      res.status(404).json({ error: "Webhook not found" });
      return;
    }
    res.json({ ok: true, deactivated: req.params.id });
  });

  app.post("/api/webhooks/test-dispatch", async (req: Request, res: Response) => {
    if (isProduction()) {
      const secret = process.env.WEBHOOK_TEST_SECRET?.trim();
      const provided = req.headers["x-webhook-test-secret"];
      if (!secret || provided !== secret) {
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
