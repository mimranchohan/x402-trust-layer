import { db } from "./db.js";

function dayKey(agentId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${agentId}:${day}`;
}

const sumDay = db.prepare(
  `SELECT COALESCE(SUM(amount_usdc), 0) AS total FROM spend_ledger WHERE agent_id = ? AND day_key = ?`,
);
const insertSpend = db.prepare(
  `INSERT INTO spend_ledger (agent_id, amount_usdc, day_key) VALUES (?, ?, ?)`,
);

export async function getSpentToday(agentId: string): Promise<number> {
  const row = sumDay.get(agentId, dayKey(agentId)) as { total: number } | undefined;
  return row?.total ?? 0;
}

export async function recordSpend(agentId: string, amountUsdc: number): Promise<number> {
  const dk = dayKey(agentId);
  insertSpend.run(agentId, amountUsdc, dk);
  const row = sumDay.get(agentId, dk) as { total: number };
  return row.total;
}
