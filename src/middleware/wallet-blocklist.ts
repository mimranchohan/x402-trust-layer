/**
 * Wallet Blocklist Middleware
 *
 * Blocks requests from wallet addresses on a persistent SQLite blocklist.
 * Admin API: POST/GET/DELETE /api/admin/blocklist
 *
 * Wallet address resolved from (in order):
 *   1. X-Wallet-Address header
 *   2. req.body.walletAddress
 *   3. req.query.wallet
 *
 * Returns 403 JSON when blocked.
 */

import type { Request, Response, NextFunction, Express, RequestHandler } from "express";
import { constantTimeEqual } from "../protocol/crypto.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// SQLite table (lazy-created)
// ---------------------------------------------------------------------------

let tableReady = false;

function ensureTable(): void {
  if (tableReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_blocklist (
      address    TEXT PRIMARY KEY,
      reason     TEXT,
      blocked_at TEXT NOT NULL,
      blocked_by TEXT
    );
  `);
  tableReady = true;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BlockRow = {
  address: string;
  reason: string | null;
  blocked_at: string;
  blocked_by: string | null;
};

export type BlockedWallet = {
  address: string;
  reason: string | null;
  blockedAt: string;
  blockedBy: string | null;
};

// ---------------------------------------------------------------------------
// DB helpers (exported so tests and routes can use them directly)
// ---------------------------------------------------------------------------

function rowToWallet(row: BlockRow): BlockedWallet {
  return {
    address: row.address,
    reason: row.reason,
    blockedAt: row.blocked_at,
    blockedBy: row.blocked_by,
  };
}

export function isBlocked(address: string): boolean {
  ensureTable();
  return (
    db
      .prepare("SELECT 1 FROM wallet_blocklist WHERE address = ?")
      .get(address.toLowerCase().trim()) !== undefined
  );
}

export function addToBlocklist(
  address: string,
  opts?: { reason?: string; blockedBy?: string },
): BlockedWallet {
  ensureTable();
  const normalized = address.toLowerCase().trim();
  db.prepare(
    "INSERT OR REPLACE INTO wallet_blocklist (address, reason, blocked_at, blocked_by) VALUES (?, ?, ?, ?)",
  ).run(normalized, opts?.reason ?? null, new Date().toISOString(), opts?.blockedBy ?? null);
  return rowToWallet(
    db
      .prepare("SELECT * FROM wallet_blocklist WHERE address = ?")
      .get(normalized) as BlockRow,
  );
}

export function removeFromBlocklist(address: string): boolean {
  ensureTable();
  const info = db
    .prepare("DELETE FROM wallet_blocklist WHERE address = ?")
    .run(address.toLowerCase().trim());
  return info.changes > 0;
}

export function listBlocklist(limit = 200, offset = 0): BlockedWallet[] {
  ensureTable();
  return (
    db
      .prepare(
        "SELECT * FROM wallet_blocklist ORDER BY blocked_at DESC LIMIT ? OFFSET ?",
      )
      .all(limit, offset) as BlockRow[]
  ).map(rowToWallet);
}

export function countBlocklist(): number {
  ensureTable();
  const row = db
    .prepare("SELECT COUNT(*) as n FROM wallet_blocklist")
    .get() as { n: number };
  return row.n;
}

// ---------------------------------------------------------------------------
// Extract wallet address from request
// ---------------------------------------------------------------------------

function extractWallet(req: Request): string | null {
  const h = req.headers["x-wallet-address"];
  if (typeof h === "string" && h.trim()) return h.trim();

  if (req.body && typeof req.body.walletAddress === "string" && req.body.walletAddress.trim())
    return req.body.walletAddress.trim();

  const q = req.query.wallet;
  if (typeof q === "string" && q.trim()) return q.trim();

  return null;
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

export function walletBlocklistMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const wallet = extractWallet(req);
    if (!wallet) { next(); return; }

    if (isBlocked(wallet)) {
      logger.warn({ wallet, path: req.path }, "[blocklist] blocked wallet rejected");
      res.status(403).json({ error: "Wallet address is blocklisted", wallet });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Admin auth helper
// ---------------------------------------------------------------------------

function requireAdmin(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) { res.status(503).json({ error: "ADMIN_SECRET not configured" }); return false; }
  const raw = req.headers["x-admin-secret"];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (!provided || !constantTimeEqual(secret, provided)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Admin routes
// ---------------------------------------------------------------------------

export function registerBlocklistRoutes(app: Express): void {
  /** GET /api/admin/blocklist */
  app.get("/api/admin/blocklist", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const offset = Number(req.query.offset) || 0;
    res.json({ ok: true, total: countBlocklist(), limit, offset, entries: listBlocklist(limit, offset) });
  });

  /** POST /api/admin/blocklist  { address, reason?, blockedBy? } */
  app.post("/api/admin/blocklist", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { address, reason, blockedBy } = (req.body ?? {}) as Record<string, string>;
    if (typeof address !== "string" || address.trim().length < 10) {
      res.status(400).json({ error: "address required (min 10 chars)" });
      return;
    }
    const entry = addToBlocklist(address, { reason, blockedBy });
    logger.info({ address: entry.address, reason }, "[blocklist] wallet added");
    res.status(201).json({ ok: true, entry });
  });

  /** DELETE /api/admin/blocklist/:address */
  app.delete("/api/admin/blocklist/:address", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const removed = removeFromBlocklist(req.params.address);
    if (!removed) { res.status(404).json({ error: "Address not found in blocklist" }); return; }
    logger.info({ address: req.params.address }, "[blocklist] wallet removed");
    res.json({ ok: true, removed: req.params.address });
  });
}
