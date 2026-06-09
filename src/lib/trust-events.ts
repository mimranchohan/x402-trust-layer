/**
 * Trust Score Event Emitter
 *
 * Fires "tier.changed" events whenever a wallet's trust tier changes.
 * Listeners can be registered in-process (EventEmitter) or via HTTP webhook
 * subscriptions stored in SQLite (mirrors the webhooks.ts pattern).
 *
 * Usage:
 *   import { trustEvents, emitTierChange } from "../lib/trust-events.js";
 *   trustEvents.on("tier.changed", (e) => console.log(e));
 *   emitTierChange({ walletAddress, previousTier: "STANDARD", newTier: "GOLD", ... });
 */

import { EventEmitter } from "node:events";
import { createHmac, randomBytes } from "node:crypto";
import { db } from "./db.js";
import { assertValidWebhookUrl } from "./webhooks.js";
import { logger } from "./logger.js";
import type { TrustTier } from "./erc8004/constants.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TierChangedEvent = {
  walletAddress: string;
  agentId: string | null;
  previousTier: TrustTier | null;
  newTier: TrustTier;
  trustScore: number;
  timestamp: string;
};

export type TrustWebhookSubscription = {
  id: string;
  url: string;
  secret: string;
  createdAt: string;
  active: boolean;
};

type TrustSubRow = {
  id: string;
  url: string;
  secret: string;
  created_at: string;
  active: number;
};

// ---------------------------------------------------------------------------
// In-process EventEmitter
// ---------------------------------------------------------------------------

class TrustEventEmitter extends EventEmitter {
  on(event: "tier.changed", listener: (e: TierChangedEvent) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  emit(event: "tier.changed", payload: TierChangedEvent): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}

export const trustEvents = new TrustEventEmitter();
trustEvents.setMaxListeners(50);

// ---------------------------------------------------------------------------
// SQLite — trust_webhook_subscriptions table (lazy-created)
// ---------------------------------------------------------------------------

let tableReady = false;

function ensureTable(): void {
  if (tableReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS trust_webhook_subscriptions (
      id         TEXT PRIMARY KEY,
      url        TEXT NOT NULL UNIQUE,
      secret     TEXT NOT NULL,
      created_at TEXT NOT NULL,
      active     INTEGER NOT NULL DEFAULT 1
    );
  `);
  tableReady = true;
}

// ---------------------------------------------------------------------------
// Tier cache — detect changes
// ---------------------------------------------------------------------------

const tierCache = new Map<string, TrustTier>();

/**
 * Call this after every computeTrustScore call.
 * Returns true if the tier actually changed (and fires events).
 */
export async function emitTierChange(event: TierChangedEvent): Promise<boolean> {
  const cached = tierCache.get(event.walletAddress.toLowerCase());

  // Detect change
  if (cached !== undefined && cached === event.newTier) {
    return false; // no change
  }

  tierCache.set(event.walletAddress.toLowerCase(), event.newTier);

  // Skip if this is just first-time population (no previous tier)
  if (cached === undefined && event.previousTier === null) {
    return false;
  }

  // Fire in-process event
  trustEvents.emit("tier.changed", event);

  // Fire HTTP webhooks (fire-and-forget, don't block caller)
  void dispatchTrustWebhooks(event).catch((err: unknown) => {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[trust-events] webhook dispatch error",
    );
  });

  logger.info(
    {
      wallet: event.walletAddress,
      from: event.previousTier ?? "none",
      to: event.newTier,
      score: event.trustScore,
    },
    "[trust-events] tier changed",
  );

  return true;
}

// ---------------------------------------------------------------------------
// HTTP Webhook registry
// ---------------------------------------------------------------------------

export function registerTrustWebhook(url: string): TrustWebhookSubscription {
  ensureTable();
  assertValidWebhookUrl(url);

  // Check for existing active subscription
  const existing = db
    .prepare("SELECT * FROM trust_webhook_subscriptions WHERE url = ? AND active = 1")
    .get(url) as TrustSubRow | undefined;

  if (existing) {
    return rowToSub(existing);
  }

  const sub: TrustWebhookSubscription = {
    id: `twh_${randomBytes(8).toString("hex")}`,
    url,
    secret: randomBytes(24).toString("hex"),
    createdAt: new Date().toISOString(),
    active: true,
  };

  db.prepare(`
    INSERT OR IGNORE INTO trust_webhook_subscriptions (id, url, secret, created_at, active)
    VALUES (?, ?, ?, ?, 1)
  `).run(sub.id, sub.url, sub.secret, sub.createdAt);

  return sub;
}

export function listTrustWebhooks(): TrustWebhookSubscription[] {
  ensureTable();
  return (
    db
      .prepare("SELECT * FROM trust_webhook_subscriptions WHERE active = 1 ORDER BY created_at DESC")
      .all() as TrustSubRow[]
  ).map(rowToSub);
}

export function deactivateTrustWebhook(id: string): boolean {
  ensureTable();
  const info = db
    .prepare("UPDATE trust_webhook_subscriptions SET active = 0 WHERE id = ?")
    .run(id);
  return info.changes > 0;
}

// ---------------------------------------------------------------------------
// Webhook delivery
// ---------------------------------------------------------------------------

function rowToSub(row: TrustSubRow): TrustWebhookSubscription {
  return {
    id: row.id,
    url: row.url,
    secret: row.secret,
    createdAt: row.created_at,
    active: row.active === 1,
  };
}

function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

async function dispatchTrustWebhooks(event: TierChangedEvent): Promise<void> {
  const subs = listTrustWebhooks();
  if (subs.length === 0) return;

  const body = JSON.stringify({
    event: "tier.changed",
    timestamp: event.timestamp,
    data: event,
  });

  await Promise.allSettled(
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
            "x-trust-layer-event": "tier.changed",
            "x-hub-signature-256": signPayload(sub.secret, body),
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          logger.warn(
            { url: sub.url, status: res.status },
            "[trust-events] webhook delivery failed",
          );
        }
      } catch (err) {
        logger.warn(
          { url: sub.url, err: err instanceof Error ? err.message : String(err) },
          "[trust-events] webhook delivery error",
        );
      }
    }),
  );
}
