import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  getEscrowFromDb,
  saveEscrowToDb,
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

export async function createEscrow(input: Omit<EscrowRecord, "id" | "status" | "createdAt" | "releasedAt">): Promise<EscrowRecord> {
  const store = await readStore();
  const record: EscrowRecord = {
    ...input,
    id: randomUUID(),
    status: "pending",
    createdAt: new Date().toISOString(),
    releasedAt: null,
  };
  store[record.id] = record;
  await writeStore(store);
  saveEscrowToDb(record);
  syncLedgerEscrow(record);
  return record;
}

export async function getEscrow(id: string): Promise<EscrowRecord | null> {
  const fromDb = getEscrowFromDb(id);
  if (fromDb) return fromDb;
  const store = await readStore();
  return store[id] ?? null;
}

export async function releaseEscrow(id: string): Promise<EscrowRecord | null> {
  const store = await readStore();
  const record = store[id];
  if (!record || record.status !== "pending") return null;
  record.status = "released";
  record.releasedAt = new Date().toISOString();
  await writeStore(store);
  saveEscrowToDb(record);
  syncLedgerEscrow(record);
  return record;
}
