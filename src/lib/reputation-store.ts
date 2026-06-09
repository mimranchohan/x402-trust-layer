/**
 * Reputation History Store (SQLite-backed)
 *
 * Records a trust-score snapshot every time `recordReputation` is called.
 * Callers should invoke this after every successful computeTrustScore that
 * results in a persisted payment or guard decision.
 *
 * Table: agent_reputation_history
 *   id           INTEGER PK AUTOINCREMENT
 *   wallet       TEXT NOT NULL (lowercase)
 *   agent_id     TEXT (nullable)
 *   trust_score  INTEGER NOT NULL
 *   tier         TEXT NOT NULL
 *   chain        TEXT NOT NULL DEFAULT 'base'
 *   source       TEXT NOT NULL DEFAULT 'guard'   -- e.g. 'guard', 'identity-gate', 'manual'
 *   recorded_at  INTEGER NOT NULL (unix seconds)
 */

import { db } from "./db.js";
import { isEvmAddress } from "./erc8004/constants.js";
import type { TrustTier } from "./erc8004/constants.js";

// ---------------------------------------------------------------------------
// Table bootstrap (lazy — runs once)
// ---------------------------------------------------------------------------

let tableReady = false;

function ensureTable(): void {
  if (tableReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_reputation_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet       TEXT    NOT NULL,
      agent_id     TEXT,
      trust_score  INTEGER NOT NULL,
      tier         TEXT    NOT NULL,
      chain        TEXT    NOT NULL DEFAULT 'base',
      source       TEXT    NOT NULL DEFAULT 'guard',
      recorded_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_rep_wallet_ts
      ON agent_reputation_history (wallet, recorded_at DESC);
  `);
  tableReady = true;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReputationEntry = {
  id: number;
  wallet: string;
  agentId: string | null;
  trustScore: number;
  tier: TrustTier;
  chain: string;
  source: string;
  recordedAt: string; // ISO-8601
};

type RepRow = {
  id: number;
  wallet: string;
  agent_id: string | null;
  trust_score: number;
  tier: string;
  chain: string;
  source: string;
  recorded_at: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToEntry(row: RepRow): ReputationEntry {
  return {
    id: row.id,
    wallet: row.wallet,
    agentId: row.agent_id,
    trustScore: row.trust_score,
    tier: row.tier as TrustTier,
    chain: row.chain,
    source: row.source,
    recordedAt: new Date(row.recorded_at * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Persist a new reputation snapshot for a wallet. */
export function recordReputation(input: {
  wallet: string;
  agentId?: string | null;
  trustScore: number;
  tier: TrustTier;
  chain?: string;
  source?: string;
}): void {
  ensureTable();
  const wallet = input.wallet.trim().toLowerCase();
  if (!wallet) return;
  db.prepare(`
    INSERT INTO agent_reputation_history
      (wallet, agent_id, trust_score, tier, chain, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    wallet,
    input.agentId ?? null,
    Math.round(input.trustScore),
    input.tier,
    input.chain ?? "base",
    input.source ?? "guard",
  );
}

/** Retrieve the reputation history for a wallet, newest-first. */
export function getReputationHistory(
  wallet: string,
  opts: { limit?: number; offset?: number; chain?: string } = {},
): { entries: ReputationEntry[]; total: number } {
  ensureTable();
  const normalized = wallet.trim().toLowerCase();

  const chainClause = opts.chain ? " AND chain = ?" : "";
  const chainArg = opts.chain ? [opts.chain] : [];

  const total = (
    db.prepare(
      `SELECT COUNT(*) AS c FROM agent_reputation_history WHERE wallet = ?${chainClause}`,
    ).get(normalized, ...chainArg) as { c: number }
  ).c;

  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  const rows = db.prepare(
    `SELECT * FROM agent_reputation_history
     WHERE wallet = ?${chainClause}
     ORDER BY recorded_at DESC
     LIMIT ? OFFSET ?`,
  ).all(normalized, ...chainArg, limit, offset) as RepRow[];

  return { entries: rows.map(rowToEntry), total };
}

/** Return the most recent entry for a wallet (or null). */
export function getLatestReputation(wallet: string): ReputationEntry | null {
  ensureTable();
  const normalized = wallet.trim().toLowerCase();
  const row = db.prepare(
    `SELECT * FROM agent_reputation_history WHERE wallet = ? ORDER BY recorded_at DESC LIMIT 1`,
  ).get(normalized) as RepRow | undefined;
  return row ? rowToEntry(row) : null;
}

/** Validate a wallet address string — EVM or non-empty Solana-ish. */
export function isValidWallet(addr: string): boolean {
  const t = addr.trim();
  if (!t || t.length < 16) return false;
  return true; // accept EVM + Solana; EVM check is tighter
}

/** True if the address looks like a valid EVM address. */
export { isEvmAddress };
