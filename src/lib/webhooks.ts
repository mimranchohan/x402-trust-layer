import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "./db.js";
import { assertSafeOutboundUrl, UnsafeUrlError } from "./ssrf.js";

const LEGACY_STORE_PATH = join(process.cwd(), "data", "webhooks.json");

export type WebhookEvent =
  | "guard.denied"
  | "guard.allowed"
  | "receipt.invalid"
  | "spend.cap_exceeded"
  | "merchant.trust_low";

export type WebhookSubscription = {
  id: string;
  fleetId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  createdAt: string;
  active: boolean;
};

type SubRow = {
  id: string;
  fleet_id: string;
  url: string;
  events: string;
  secret: string;
  created_at: string;
  active: number;
};

const selectActive = db.prepare(
  "SELECT * FROM webhook_subscriptions WHERE active = 1 ORDER BY created_at DESC",
);
const selectByIdFleet = db.prepare(
  "SELECT * FROM webhook_subscriptions WHERE id = ? AND fleet_id = ?",
);
const insertSub = db.prepare(`
  INSERT INTO webhook_subscriptions (id, fleet_id, url, events, secret, created_at, active)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`);
const deactivateSub = db.prepare(
  "UPDATE webhook_subscriptions SET active = 0 WHERE id = ? AND fleet_id = ?",
);

function rowToSub(row: SubRow): WebhookSubscription {
  return {
    id: row.id,
    fleetId: row.fleet_id,
    url: row.url,
    events: JSON.parse(row.events) as WebhookEvent[],
    secret: row.secret,
    createdAt: row.created_at,
    active: row.active === 1,
  };
}

async function migrateLegacyOnce(): Promise<void> {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM webhook_subscriptions").get() as { c: number })
    .c;
  if (count > 0) return;
  try {
    const raw = await readFile(LEGACY_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as { subscriptions?: WebhookSubscription[] };
    for (const s of parsed.subscriptions ?? []) {
      insertSub.run(
        s.id,
        s.fleetId,
        s.url,
        JSON.stringify(s.events),
        s.secret,
        s.createdAt,
      );
      if (!s.active) deactivateSub.run(s.id, s.fleetId);
    }
  } catch {
    /* no legacy file */
  }
}

function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Reject SSRF targets (localhost, metadata, private IPs) for outbound webhook delivery. */
export function assertValidWebhookUrl(url: string): void {
  assertSafeOutboundUrl(url);
  if (!url.startsWith("https://")) {
    throw new UnsafeUrlError("Webhook URL must use HTTPS");
  }
}

export async function registerWebhook(input: {
  fleetId: string;
  url: string;
  events: WebhookEvent[];
}): Promise<WebhookSubscription> {
  await migrateLegacyOnce();
  assertValidWebhookUrl(input.url);
  const sub: WebhookSubscription = {
    id: `wh_${randomBytes(8).toString("hex")}`,
    fleetId: input.fleetId,
    url: input.url,
    events: input.events,
    secret: randomBytes(24).toString("hex"),
    createdAt: new Date().toISOString(),
    active: true,
  };
  insertSub.run(
    sub.id,
    sub.fleetId,
    sub.url,
    JSON.stringify(sub.events),
    sub.secret,
    sub.createdAt,
  );
  return sub;
}

export async function listWebhooks(fleetId?: string): Promise<WebhookSubscription[]> {
  await migrateLegacyOnce();
  const subs = (selectActive.all() as SubRow[]).map(rowToSub);
  if (!fleetId) return subs;
  return subs.filter((s) => s.fleetId === fleetId);
}

export async function deactivateWebhook(id: string, fleetId: string): Promise<boolean> {
  await migrateLegacyOnce();
  const row = selectByIdFleet.get(id, fleetId) as SubRow | undefined;
  if (!row) return false;
  deactivateSub.run(id, fleetId);
  return true;
}

export async function dispatchWebhooks(
  event: WebhookEvent,
  payload: Record<string, unknown>,
  fleetId?: string,
): Promise<{ delivered: number; failed: number }> {
  const subs = (await listWebhooks(fleetId)).filter((s) => s.events.includes(event));
  let delivered = 0;
  let failed = 0;

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        assertValidWebhookUrl(sub.url);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        const res = await fetch(sub.url, {
          method: "POST",
          redirect: "manual",
          headers: {
            "content-type": "application/json",
            "x-trust-layer-event": event,
            "x-hub-signature-256": signPayload(sub.secret, body),
          },
          body,
          signal: controller.signal,
        });
        if (res.status >= 300 && res.status < 400) {
          failed++;
          return;
        }
        clearTimeout(timer);
        if (res.ok) delivered++;
        else failed++;
      } catch {
        failed++;
      }
    }),
  );

  return { delivered, failed };
}
