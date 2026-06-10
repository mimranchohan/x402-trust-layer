import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  getEscrowFromDb,
  saveEscrowToDb,
  releaseEscrowInDb,
} from "./db-persistence.js";
import { syncLedgerEscrow } from "./escrow-unified.js";

const DATA_DIR = path.join(process.cwd(), "data");

export type EscrowRecord = {
  id: string;
  payerAgentId: string;
  payeeAgentId: string;
  amountUsdc: number;
  status: "pending" | "released" | "cancelled";
  releaseCondition: string;
  createdAt: string;
  releasedAt: string | null;
  metadata?: Record<string, unknown>;
};

type EscrowStore = Record<string, EscrowRecord>;

async function readStore(): Promise<EscrowStore> {
  await mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, "escrow-ledger.json");
  try {
    return JSON.parse(await readFile(file, "utf8")) as EscrowStore;
  } catch {
    return {};
  }
}

async function writeStore(store: EscrowStore): Promise<void> {
  const file = path.join(DATA_DIR, "escrow-ledger.json");
  await writeFile(file, JSON.stringify(store, null, 2), "utf8");
}

/**
 * Best-effort mirror of one record into the legacy JSON store.
 * SQLite (escrow_records) is authoritative; the JSON file is export/debug only,
 * so a mirror failure must never block or corrupt the authoritative DB write.
 */
async function mirrorToJson(record: EscrowRecord): Promise<void> {
  try {
    const store = await readStore();
    store[record.id] = record;
    await writeStore(store);
  } catch {
    /* non-authoritative mirror — ignore failures */
  }
}

export async function createEscrow(input: Omit<EscrowRecord, "id" | "status" | "createdAt" | "releasedAt">): Promise<EscrowRecord> {
  const record: EscrowRecord = {
    ...input,
    id: randomUUID(),
    status: "pending",
    createdAt: new Date().toISOString(),
    releasedAt: null,
  };
  saveEscrowToDb(record);
  syncLedgerEscrow(record);
  await mirrorToJson(record);
  return record;
}

export async function getEscrow(id: string): Promise<EscrowRecord | null> {
  const fromDb = getEscrowFromDb(id);
  if (fromDb) return fromDb;
  const store = await readStore();
  return store[id] ?? null;
}

export async function releaseEscrow(id: string): Promise<EscrowRecord | null> {
  // Atomic, race-safe transition: only one concurrent caller wins.
  const released = releaseEscrowInDb(id, new Date().toISOString());
  if (!released) return null;
  syncLedgerEscrow(released);
  await mirrorToJson(released);
  return released;
}
