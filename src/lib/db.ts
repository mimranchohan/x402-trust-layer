import Database, { type Database as SqliteDatabase } from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { runMigrations } from "./migrations.js";

export function resolveDbPath(): string {
  const explicit = process.env.DB_PATH?.trim();
  if (explicit) return explicit;
  const dataDir = process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
  return path.join(dataDir, "trust-layer.db");
}

const DB_PATH = resolveDbPath();

function ensureDataDirWritable(): void {
  const dir = path.dirname(DB_PATH);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot create data directory ${dir} (${msg}). ` +
        `On Railway, mount the volume at /app/data and set DATA_DIR=/app/data (or omit DATA_DIR). ` +
        `SQLITE_CANTOPEN often means the volume is not writable by the app user.`,
    );
  }
}

ensureDataDirWritable();

let db: SqliteDatabase;
try {
  db = new Database(DB_PATH);
} catch (err) {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
  if (code === "SQLITE_CANTOPEN") {
    throw new Error(
      `Cannot open SQLite database at ${DB_PATH}. ` +
        `Check DATA_DIR matches the volume mount (use /app/data). ` +
        `Redeploy with the docker entrypoint that chowns the volume, or fix volume permissions.`,
      { cause: err },
    );
  }
  throw err;
}

export { db };

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS attestations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    payload JSON NOT NULL,
    hmac_signature TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at INTEGER,
    revoked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS spend_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    wallet_address TEXT,
    endpoint TEXT,
    amount_usdc REAL NOT NULL,
    network TEXT,
    tx_hash TEXT,
    day_key TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_spend_day ON spend_ledger(agent_id, day_key);

  CREATE TABLE IF NOT EXISTS mpp_sessions (
    session_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    budget_usdc REAL NOT NULL,
    spent_usdc REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    closed_at INTEGER,
    payload TEXT
  );

  CREATE TABLE IF NOT EXISTS escrow_records (
    escrow_id TEXT PRIMARY KEY,
    buyer_agent_id TEXT NOT NULL,
    seller_agent_id TEXT NOT NULL,
    amount_usdc REAL NOT NULL,
    condition_hash TEXT,
    status TEXT NOT NULL DEFAULT 'held',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    released_at INTEGER,
    payload TEXT
  );

  CREATE TABLE IF NOT EXISTS used_nonces (
    nonce TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    used_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_nonces_time ON used_nonces(used_at);
`);

function ensurePayloadColumns(): void {
  const mppCols = db.prepare("PRAGMA table_info(mpp_sessions)").all() as { name: string }[];
  if (!mppCols.some((c) => c.name === "payload")) {
    db.exec("ALTER TABLE mpp_sessions ADD COLUMN payload TEXT");
  }
  const escCols = db.prepare("PRAGMA table_info(escrow_records)").all() as { name: string }[];
  if (!escCols.some((c) => c.name === "payload")) {
    db.exec("ALTER TABLE escrow_records ADD COLUMN payload TEXT");
  }
}

ensurePayloadColumns();
runMigrations(db);

export function dbPath(): string {
  return DB_PATH;
}
