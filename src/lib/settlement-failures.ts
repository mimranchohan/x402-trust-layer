/**
 * Settlement Failure Persistence + Circuit Breaker
 *
 * - logSettlementFailure(): SQLite mein failure detail save karo
 * - getRecentFailures(): last N failures return karo (admin endpoint)
 * - checkCircuitBreaker(): 5+ failures in 60s → circuit open
 */

import { db } from "./db.js";
import { logger } from "./logger.js";

export type SettlementFailure = {
  id: number;
  reason: string;
  wallet_address: string | null;
  amount_usdc: string | null;
  network: string | null;
  endpoint: string | null;
  created_at: number;
};

export type CircuitBreakerStatus = {
  open: boolean;
  recentCount: number;
  windowSec: number;
  threshold: number;
  hint?: string;
};

const CIRCUIT_THRESHOLD = Number(process.env.SETTLEMENT_CIRCUIT_THRESHOLD ?? "5");
const CIRCUIT_WINDOW_SEC = Number(process.env.SETTLEMENT_CIRCUIT_WINDOW_SEC ?? "60");

// ---------------------------------------------------------------------------
// Log a failure to SQLite
// ---------------------------------------------------------------------------

export function logSettlementFailure(opts: {
  reason: string;
  walletAddress?: string;
  amountUsdc?: string;
  network?: string;
  endpoint?: string;
}): void {
  try {
    db.prepare(`
      INSERT INTO settlement_failures (reason, wallet_address, amount_usdc, network, endpoint)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      opts.reason,
      opts.walletAddress ?? null,
      opts.amountUsdc ?? null,
      opts.network ?? null,
      opts.endpoint ?? null,
    );
  } catch (err) {
    // Never throw — this is observability, not critical path
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[settlement-failures] failed to persist failure record",
    );
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getRecentFailures(limit = 50): SettlementFailure[] {
  try {
    return db.prepare(`
      SELECT id, reason, wallet_address, amount_usdc, network, endpoint, created_at
      FROM settlement_failures
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as SettlementFailure[];
  } catch {
    return [];
  }
}

export function checkCircuitBreaker(): CircuitBreakerStatus {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - CIRCUIT_WINDOW_SEC;
    const row = db.prepare(`
      SELECT COUNT(*) AS cnt FROM settlement_failures WHERE created_at >= ?
    `).get(cutoff) as { cnt: number } | undefined;

    const recentCount = row?.cnt ?? 0;
    const open = recentCount >= CIRCUIT_THRESHOLD;

    return {
      open,
      recentCount,
      windowSec: CIRCUIT_WINDOW_SEC,
      threshold: CIRCUIT_THRESHOLD,
      hint: open
        ? `${recentCount} settlement failures in last ${CIRCUIT_WINDOW_SEC}s — consider switching facilitator or pausing new payments`
        : undefined,
    };
  } catch {
    return { open: false, recentCount: 0, windowSec: CIRCUIT_WINDOW_SEC, threshold: CIRCUIT_THRESHOLD };
  }
}
