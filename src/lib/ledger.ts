import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

type DayLedger = Record<string, number>;

async function readLedger(): Promise<DayLedger> {
  await mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, "spend-ledger.json");
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as DayLedger;
  } catch {
    return {};
  }
}

async function writeLedger(ledger: DayLedger): Promise<void> {
  const file = path.join(DATA_DIR, "spend-ledger.json");
  await writeFile(file, JSON.stringify(ledger, null, 2), "utf8");
}

function todayKey(agentId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${agentId}:${day}`;
}

export async function getSpentToday(agentId: string): Promise<number> {
  const ledger = await readLedger();
  return ledger[todayKey(agentId)] ?? 0;
}

export async function recordSpend(agentId: string, amountUsdc: number): Promise<number> {
  const ledger = await readLedger();
  const key = todayKey(agentId);
  ledger[key] = (ledger[key] ?? 0) + amountUsdc;
  await writeLedger(ledger);
  return ledger[key];
}
