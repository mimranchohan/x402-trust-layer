import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { logger } from "./logger.js";

const require = createRequire(import.meta.url);

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
        `On Railway, mount the volume at /app/data and set DATA_DIR=/app/data (or omit DATA_DIR).`
    );
  }
}

ensureDataDirWritable();

// Try loading better-sqlite3
let SqliteDatabaseClass: any = null;
try {
  SqliteDatabaseClass = require("better-sqlite3");
} catch (err) {
  const isProd =
    process.env.NODE_ENV === "production" ||
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RAILWAY_PUBLIC_DOMAIN;
  if (isProd) {
    throw new Error(
      "better-sqlite3 failed to load in production. Ensure the native module is compiled for this platform. " +
        String(err instanceof Error ? err.message : err),
    );
  }
  // Dev/test only: warn and fall back to JsonDatabase
  logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[DB] better-sqlite3 unavailable — using JSON fallback (dev/test only)");
}

// Statement interface mimicking better-sqlite3
export class Statement {
  private query: string;
  private db: JsonDatabase;

  constructor(query: string, db: JsonDatabase) {
    this.query = query.trim().replace(/\s+/g, " ");
    this.db = db;
  }

  run(...args: any[]): { changes: number; lastInsertRowid: number } {
    const sizeBefore = this.db.dataSize();
    this.db.executeWrite(this.query, args);
    const sizeAfter = this.db.dataSize();
    // Detect whether a write actually happened (nonce inserts skip on duplicate)
    const changed = sizeAfter !== sizeBefore;
    return { changes: changed ? 1 : 0, lastInsertRowid: changed ? sizeAfter : 0 };
  }

  get(...args: any[]): any {
    return this.db.executeGet(this.query, args);
  }

  all(...args: any[]): any[] {
    return this.db.executeAll(this.query, args);
  }
}

class JsonDatabase {
  private filepath: string;
  private data: {
    attestations: Record<string, any>;
    spend_ledger: any[];
    mpp_sessions: Record<string, any>;
    escrow_records: Record<string, any>;
    used_nonces: Record<string, any>;
  };

  constructor(filepath: string) {
    this.filepath = filepath.replace(/\.db$/, ".json"); // Save as json
    this.data = {
      attestations: {},
      spend_ledger: [],
      mpp_sessions: {},
      escrow_records: {},
      used_nonces: {},
    };
    this.load();
  }

  private load() {
    try {
      if (existsSync(this.filepath)) {
        const raw = readFileSync(this.filepath, "utf8");
        const parsed = JSON.parse(raw);
        this.data = {
          attestations: parsed.attestations || {},
          spend_ledger: parsed.spend_ledger || [],
          mpp_sessions: parsed.mpp_sessions || {},
          escrow_records: parsed.escrow_records || {},
          used_nonces: parsed.used_nonces || {},
        };
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[DB] Failed to load JSON database, starting fresh");
    }
  }

  private save() {
    try {
      writeFileSync(this.filepath, JSON.stringify(this.data, null, 2), "utf8");
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[DB] Failed to save JSON database");
    }
  }

  /** Returns a simple count used by Statement.run() to detect whether a write actually changed data. */
  dataSize(): number {
    return (
      Object.keys(this.data.attestations).length +
      this.data.spend_ledger.length +
      Object.keys(this.data.mpp_sessions).length +
      Object.keys(this.data.escrow_records).length +
      Object.keys(this.data.used_nonces).length
    );
  }

  pragma(_str: string) {}
  exec(_str: string) {}

  prepare(query: string): Statement {
    return new Statement(query, this);
  }

  executeWrite(query: string, args: any[]) {
    const q = query.toLowerCase();
    if (q.startsWith("insert into spend_ledger")) {
      const [agent_id, amount_usdc, day_key] = args;
      this.data.spend_ledger.push({
        id: this.data.spend_ledger.length + 1,
        agent_id: String(agent_id),
        amount_usdc: Number(amount_usdc),
        day_key: String(day_key),
        created_at: Math.floor(Date.now() / 1000)
      });
      this.save();
    } else if (q.startsWith("insert or ignore into used_nonces")) {
      const [nonce, network] = args;
      const key = String(nonce);
      if (!this.data.used_nonces[key]) {
        this.data.used_nonces[key] = {
          nonce: key,
          network: String(network),
          used_at: Math.floor(Date.now() / 1000)
        };
        this.save();
      }
    } else if (q.startsWith("delete from used_nonces")) {
      const [cutoff] = args;
      const limit = Number(cutoff);
      let changed = false;
      for (const k in this.data.used_nonces) {
        if (this.data.used_nonces[k].used_at < limit) {
          delete this.data.used_nonces[k];
          changed = true;
        }
      }
      if (changed) this.save();
    } else if (q.startsWith("insert into mpp_sessions") || q.includes("on conflict(session_id)")) {
      const [session_id, agent_id, budget_usdc, spent_usdc, status, created_at, closed_at, payload] = args;
      const sid = String(session_id);
      this.data.mpp_sessions[sid] = {
        session_id: sid,
        agent_id: String(agent_id),
        budget_usdc: Number(budget_usdc),
        spent_usdc: Number(spent_usdc),
        status: String(status),
        created_at: Number(created_at),
        closed_at: closed_at ? Number(closed_at) : null,
        payload: String(payload)
      };
      this.save();
    } else if (q.startsWith("insert into escrow_records") || q.includes("on conflict(escrow_id)")) {
      const [escrow_id, buyer_agent_id, seller_agent_id, amount_usdc, condition_hash, status, created_at, released_at, payload] = args;
      const eid = String(escrow_id);
      this.data.escrow_records[eid] = {
        escrow_id: eid,
        buyer_agent_id: String(buyer_agent_id),
        seller_agent_id: String(seller_agent_id),
        amount_usdc: Number(amount_usdc),
        condition_hash: String(condition_hash),
        status: String(status),
        created_at: Number(created_at),
        released_at: released_at ? Number(released_at) : null,
        payload: String(payload)
      };
      this.save();
    } else if (q.startsWith("insert into attestations") || q.includes("on conflict(id)")) {
      const [id, agent_id, wallet_address, payload, hmac_signature, expires_at] = args;
      const aid = String(id);
      this.data.attestations[aid] = {
        id: aid,
        agent_id: String(agent_id),
        wallet_address: String(wallet_address),
        payload: typeof payload === "string" ? payload : JSON.stringify(payload),
        hmac_signature: String(hmac_signature),
        created_at: Math.floor(Date.now() / 1000),
        expires_at: expires_at ? Number(expires_at) : null,
        revoked: 0
      };
      this.save();
    } else if (q.startsWith("update attestations set revoked = 1")) {
      const [id] = args;
      const aid = String(id);
      if (this.data.attestations[aid]) {
        this.data.attestations[aid].revoked = 1;
        this.save();
      }
    }
  }

  executeGet(query: string, args: any[]): any {
    const q = query.toLowerCase();
    if (q.includes("coalesce(sum(amount_usdc)")) {
      const [agent_id, day_key] = args;
      const total = this.data.spend_ledger
        .filter(row => row.agent_id === String(agent_id) && row.day_key === String(day_key))
        .reduce((sum, row) => sum + row.amount_usdc, 0);
      return { total };
    } else if (q.includes("from used_nonces where nonce = ?")) {
      const [nonce] = args;
      const key = String(nonce);
      return this.data.used_nonces[key] ? { ok: 1 } : null;
    } else if (q.includes("from mpp_sessions where session_id = ?")) {
      const [session_id] = args;
      const sid = String(session_id);
      const row = this.data.mpp_sessions[sid];
      return row ? { ...row } : undefined;
    } else if (q.includes("from escrow_records where escrow_id = ?")) {
      const [escrow_id] = args;
      const eid = String(escrow_id);
      const row = this.data.escrow_records[eid];
      return row ? { ...row } : undefined;
    } else if (q.includes("from attestations where id = ?")) {
      const [id] = args;
      const aid = String(id);
      const row = this.data.attestations[aid];
      return row ? { ...row } : undefined;
    }
    return undefined;
  }

  executeAll(query: string, args: any[]): any[] {
    const q = query.toLowerCase();
    if (q.includes("from mpp_sessions where agent_id = ?")) {
      const [agent_id] = args;
      const aid = String(agent_id);
      return Object.values(this.data.mpp_sessions)
        .filter((row: any) => row.agent_id === aid)
        .sort((a: any, b: any) => b.created_at - a.created_at);
    } else if (q.includes("pragma table_info")) {
      return [{ name: "payload" }];
    }
    return [];
  }
}

// Hybrid instance initialization
let db: any;
if (SqliteDatabaseClass) {
  try {
    db = new SqliteDatabaseClass(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Initialize SQLite tables & run migrations
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

    // Ensure payload columns
    const mppCols = db.prepare("PRAGMA table_info(mpp_sessions)").all() as { name: string }[];
    if (!mppCols.some((c: any) => c.name === "payload")) {
      db.exec("ALTER TABLE mpp_sessions ADD COLUMN payload TEXT");
    }
    const escCols = db.prepare("PRAGMA table_info(escrow_records)").all() as { name: string }[];
    if (!escCols.some((c: any) => c.name === "payload")) {
      db.exec("ALTER TABLE escrow_records ADD COLUMN payload TEXT");
    }

    // Run migrations dynamically
    const { runMigrations } = require("./migrations.js");
    runMigrations(db);
  } catch (err) {
    const isProd =
      process.env.NODE_ENV === "production" ||
      !!process.env.RAILWAY_ENVIRONMENT ||
      !!process.env.RAILWAY_PUBLIC_DOMAIN;
    if (isProd) {
      throw new Error(
        "[DB] SQLite initialization failed in production — refusing to fall back to JSON store. " +
          String(err instanceof Error ? err.message : err),
      );
    }
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[DB] SQLite init failed — using JSON fallback (dev/test only)");
    db = new JsonDatabase(DB_PATH);
  }
} else {
  db = new JsonDatabase(DB_PATH);
}

export { db };

export function dbPath(): string {
  return DB_PATH;
}
