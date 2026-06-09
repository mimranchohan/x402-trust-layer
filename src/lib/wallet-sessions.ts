/**
 * Wallet Sessions — x402 V2 session store.
 *
 * x402 V2 (Jan 2026) introduced wallet sessions so an agent pays ONCE to
 * establish a session, then subsequent calls skip per-request on-chain settlement.
 * This dramatically reduces gas + latency for high-frequency agent workflows.
 *
 * Session lifecycle:
 *   1. Agent calls POST /api/session/create (x402 paid)
 *   2. Server mints a session token (JWT-like HMAC) + stores in SQLite
 *   3. Agent sends `x-session-token: <token>` on subsequent requests
 *   4. GET /api/session/verify confirms validity + remaining TTL
 *   5. DELETE /api/session/revoke ends the session early
 */

import { createHmac, randomBytes } from "node:crypto";
import { db } from "./db.js";
import { config } from "../config.js";
import { logger } from "./logger.js";

export type WalletSession = {
  sessionId: string;
  walletAddress: string;
  agentId: string | null;
  network: string;
  stablecoin: string;
  amountPaid: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  callCount: number;
  maxCalls: number | null;
  metadata: Record<string, unknown> | null;
};

export type CreateSessionInput = {
  walletAddress: string;
  agentId?: string;
  network: string;
  stablecoin?: string;
  amountPaid: string;
  ttlSeconds?: number;    // default 3600 (1 hour)
  maxCalls?: number;      // optional call cap (null = unlimited)
  metadata?: Record<string, unknown>;
};

export type SessionVerifyResult =
  | { valid: true; session: WalletSession; remainingTtl: number; remainingCalls: number | null }
  | { valid: false; reason: string };

const DEFAULT_TTL_SECONDS = 3600;       // 1 hour
const MAX_TTL_SECONDS = 86_400 * 7;    // 7 days hard cap

/** Derive a signed session token: base64url(sessionId) + "." + HMAC(sessionId) */
function signToken(sessionId: string): string {
  const secret = config.attestationHmacSecret;
  const sig = createHmac("sha256", secret).update(sessionId).digest("base64url");
  const encoded = Buffer.from(sessionId).toString("base64url");
  return `${encoded}.${sig}`;
}

/** Parse + verify a session token — returns sessionId or null if invalid */
function verifyToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  try {
    const sessionId = Buffer.from(encoded, "base64url").toString("utf8");
    const expected = createHmac("sha256", config.attestationHmacSecret)
      .update(sessionId)
      .digest("base64url");
    if (sig !== expected) return null;
    return sessionId;
  } catch {
    return null;
  }
}

/** Create a new wallet session. Returns the signed token. */
export function createWalletSession(input: CreateSessionInput): {
  token: string;
  session: WalletSession;
} {

  const sessionId = randomBytes(24).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(input.ttlSeconds ?? DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS);
  const expiresAt = now + ttl;

  const meta = input.metadata ? JSON.stringify(input.metadata) : null;

  db.prepare(
    `INSERT INTO wallet_sessions
      (session_id, wallet_address, agent_id, network, stablecoin, amount_paid,
       created_at, expires_at, revoked_at, call_count, max_calls, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
  ).run(
    sessionId,
    input.walletAddress.toLowerCase(),
    input.agentId ?? null,
    input.network,
    input.stablecoin ?? "USDC",
    input.amountPaid,
    now,
    expiresAt,
    input.maxCalls ?? null,
    meta,
  );

  const session = getSessionById(sessionId)!;
  const token = signToken(sessionId);

  logger.info({ sessionId, wallet: input.walletAddress, ttl, expiresAt }, "wallet_session_created");
  return { token, session };
}

function getSessionById(sessionId: string): WalletSession | null {

  const row = db.prepare("SELECT * FROM wallet_sessions WHERE session_id = ?").get(sessionId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return rowToSession(row);
}

function rowToSession(row: Record<string, unknown>): WalletSession {
  return {
    sessionId: String(row.session_id),
    walletAddress: String(row.wallet_address),
    agentId: row.agent_id != null ? String(row.agent_id) : null,
    network: String(row.network),
    stablecoin: String(row.stablecoin ?? "USDC"),
    amountPaid: String(row.amount_paid),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    revokedAt: row.revoked_at != null ? Number(row.revoked_at) : null,
    callCount: Number(row.call_count ?? 0),
    maxCalls: row.max_calls != null ? Number(row.max_calls) : null,
    metadata: row.metadata ? (JSON.parse(String(row.metadata)) as Record<string, unknown>) : null,
  };
}

/** Verify a session token. Increments call_count if valid. */
export function verifyWalletSession(token: string): SessionVerifyResult {
  const sessionId = verifyToken(token);
  if (!sessionId) return { valid: false, reason: "invalid_token_signature" };

  const session = getSessionById(sessionId);
  if (!session) return { valid: false, reason: "session_not_found" };

  const now = Math.floor(Date.now() / 1000);

  if (session.revokedAt !== null) return { valid: false, reason: "session_revoked" };
  if (now >= session.expiresAt) return { valid: false, reason: "session_expired" };
  if (session.maxCalls !== null && session.callCount >= session.maxCalls) {
    return { valid: false, reason: "call_limit_reached" };
  }

  // Increment call counter
  db
    .prepare("UPDATE wallet_sessions SET call_count = call_count + 1 WHERE session_id = ?")
    .run(sessionId);

  const updated = getSessionById(sessionId)!;
  const remainingTtl = session.expiresAt - now;
  const remainingCalls =
    session.maxCalls !== null ? session.maxCalls - updated.callCount : null;

  return { valid: true, session: updated, remainingTtl, remainingCalls };
}

/** Revoke a session by token. Returns true if revoked, false if not found/already revoked. */
export function revokeWalletSession(token: string): { revoked: boolean; reason?: string } {
  const sessionId = verifyToken(token);
  if (!sessionId) return { revoked: false, reason: "invalid_token_signature" };

  const session = getSessionById(sessionId);
  if (!session) return { revoked: false, reason: "session_not_found" };
  if (session.revokedAt !== null) return { revoked: false, reason: "already_revoked" };

  const now = Math.floor(Date.now() / 1000);
  db
    .prepare("UPDATE wallet_sessions SET revoked_at = ? WHERE session_id = ?")
    .run(now, sessionId);

  logger.info({ sessionId }, "wallet_session_revoked");
  return { revoked: true };
}

/** Get session info by token (no call count increment — read-only). */
export function getWalletSessionInfo(token: string): WalletSession | null {
  const sessionId = verifyToken(token);
  if (!sessionId) return null;
  return getSessionById(sessionId);
}

/** Cleanup expired + revoked sessions older than 30 days. */
export function pruneExpiredSessions(): number {
  const cutoff = Math.floor(Date.now() / 1000) - 86_400 * 30;
  const result = db
    .prepare(
      "DELETE FROM wallet_sessions WHERE (expires_at < ? OR revoked_at IS NOT NULL) AND created_at < ?",
    )
    .run(cutoff, cutoff);
  return result.changes;
}
