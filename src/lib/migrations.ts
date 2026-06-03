import type { Database as SqliteDatabase } from "better-sqlite3";

type Migration = { version: number; sql: string };

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS mandates (
        mandate_id TEXT PRIMARY KEY,
        principal TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        intent TEXT NOT NULL,
        intent_hash TEXT NOT NULL,
        scope JSON NOT NULL,
        signature TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at INTEGER,
        suite_version TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mandates_agent ON mandates(agent_id);
      CREATE INDEX IF NOT EXISTS idx_mandates_expires ON mandates(expires_at);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS protocol_kv (
        store TEXT NOT NULL,
        key TEXT NOT NULL,
        value JSON NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (store, key)
      );
      CREATE INDEX IF NOT EXISTS idx_kv_store ON protocol_kv(store, updated_at);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS idempotency_cache (
        cache_key TEXT PRIMARY KEY,
        status INTEGER NOT NULL,
        body JSON NOT NULL,
        body_hash TEXT NOT NULL,
        route TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS idempotency_inflight (
        cache_key TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id TEXT PRIMARY KEY,
        fleet_id TEXT NOT NULL,
        url TEXT NOT NULL,
        events JSON NOT NULL,
        secret TEXT NOT NULL,
        created_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_webhooks_fleet ON webhook_subscriptions(fleet_id, active);
    `,
  },
  {
    version: 6,
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_spend_tx_hash ON spend_ledger(tx_hash)
        WHERE tx_hash IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_spend_wallet ON spend_ledger(wallet_address, day_key);
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS telemetry_counters (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `,
  },
  {
    version: 8,
    sql: `
      CREATE TABLE IF NOT EXISTS escrows (
        escrow_id TEXT PRIMARY KEY,
        payer_agent_id TEXT NOT NULL,
        payee_id TEXT NOT NULL,
        amount_usdc REAL NOT NULL,
        state TEXT NOT NULL DEFAULT 'CREATED',
        resource_hash TEXT,
        session_id TEXT,
        release_condition TEXT,
        quality_score REAL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        settled_at INTEGER,
        state_proof TEXT NOT NULL,
        metadata JSON
      );
      CREATE TABLE IF NOT EXISTS escrow_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        escrow_id TEXT NOT NULL,
        from_state TEXT NOT NULL,
        to_state TEXT NOT NULL,
        note TEXT,
        transitioned_at INTEGER NOT NULL DEFAULT (unixepoch()),
        proof TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_escrow_state ON escrows(state, updated_at);
    `,
  },
];

export function runMigrations(db: SqliteDatabase): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)");
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null };
  const current = row?.v ?? 0;
  for (const m of MIGRATIONS.filter((x) => x.version > current)) {
    db.exec(m.sql);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(m.version);
  }
}
