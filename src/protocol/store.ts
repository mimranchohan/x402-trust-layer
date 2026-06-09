import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db.js";

const ROOT_KEY = "__root__";
const SAFE_STORE_NAME = /^[a-z0-9_-]{1,64}$/;
const LEGACY_DIR = path.join(process.cwd(), "data", "protocol");

function assertSafeStoreName(name: string): void {
  if (!SAFE_STORE_NAME.test(name)) {
    throw new Error(`Invalid protocol store name: ${name}`);
  }
}

function readKv<T>(store: string, key: string): T | null {
  const row = db
    .prepare("SELECT value FROM protocol_kv WHERE store = ? AND key = ?")
    .get(store, key) as { value: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.value) as T;
}

function writeKv<T>(store: string, key: string, data: T): void {
  db.prepare(
    "INSERT OR REPLACE INTO protocol_kv (store, key, value, updated_at) VALUES (?, ?, ?, unixepoch())",
  ).run(store, key, JSON.stringify(data));
}

async function migrateLegacyFile<T>(name: string): Promise<T | null> {
  const file = path.join(LEGACY_DIR, `${name}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function readProtocolStore<T>(name: string, fallback: T): Promise<T> {
  assertSafeStoreName(name);
  const hit = readKv<T>(name, ROOT_KEY);
  if (hit != null) return hit;
  const legacy = await migrateLegacyFile<T>(name);
  if (legacy != null) {
    writeKv(name, ROOT_KEY, legacy);
    return legacy;
  }
  return fallback;
}

export async function writeProtocolStore<T>(name: string, data: T): Promise<void> {
  assertSafeStoreName(name);
  writeKv(name, ROOT_KEY, data);
}

/** Per-agent keyed store (e.g. credit-bureau history by agentId). */
export async function readProtocolStoreKey<T>(
  store: string,
  key: string,
  fallback: T,
): Promise<T> {
  assertSafeStoreName(store);
  const hit = readKv<T>(store, key);
  if (hit != null) return hit;
  return fallback;
}

export async function writeProtocolStoreKey<T>(store: string, key: string, data: T): Promise<void> {
  assertSafeStoreName(store);
  writeKv(store, key, data);
}
