import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const STORE_PATH = join(process.cwd(), "data", "webhooks.json");

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

type Store = { subscriptions: WebhookSubscription[] };

function loadStore(): Store {
  try {
    if (!existsSync(STORE_PATH)) return { subscriptions: [] };
    return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Store;
  } catch {
    return { subscriptions: [] };
  }
}

function saveStore(store: Store): void {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function registerWebhook(input: {
  fleetId: string;
  url: string;
  events: WebhookEvent[];
}): WebhookSubscription {
  const store = loadStore();
  const sub: WebhookSubscription = {
    id: `wh_${randomBytes(8).toString("hex")}`,
    fleetId: input.fleetId,
    url: input.url,
    events: input.events,
    secret: randomBytes(24).toString("hex"),
    createdAt: new Date().toISOString(),
    active: true,
  };
  store.subscriptions.push(sub);
  saveStore(store);
  return sub;
}

export function listWebhooks(fleetId?: string): WebhookSubscription[] {
  const subs = loadStore().subscriptions.filter((s) => s.active);
  if (!fleetId) return subs;
  return subs.filter((s) => s.fleetId === fleetId);
}

export function deactivateWebhook(id: string, fleetId: string): boolean {
  const store = loadStore();
  const sub = store.subscriptions.find((s) => s.id === id && s.fleetId === fleetId);
  if (!sub) return false;
  sub.active = false;
  saveStore(store);
  return true;
}

function signPayload(secret: string, body: string): string {
  return createHash("sha256").update(`${secret}.${body}`).digest("hex");
}

export async function dispatchWebhooks(
  event: WebhookEvent,
  payload: Record<string, unknown>,
  fleetId?: string,
): Promise<{ delivered: number; failed: number }> {
  const subs = listWebhooks(fleetId).filter((s) => s.events.includes(event));
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
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        const res = await fetch(sub.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-trust-layer-event": event,
            "x-trust-layer-signature": signPayload(sub.secret, body),
          },
          body,
          signal: controller.signal,
        });
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
