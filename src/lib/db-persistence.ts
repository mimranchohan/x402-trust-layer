import { db } from "./db.js";
import type { MppSession } from "../agents/mpp-session-v2.js";
import type { EscrowRecord } from "./escrow-ledger.js";

const getMpp = db.prepare(
  "SELECT session_id, agent_id, budget_usdc, spent_usdc, status, created_at, closed_at, payload FROM mpp_sessions WHERE session_id = ?",
);
const upsertMpp = db.prepare(`
  INSERT INTO mpp_sessions (session_id, agent_id, budget_usdc, spent_usdc, status, created_at, closed_at, payload)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(session_id) DO UPDATE SET
    spent_usdc = excluded.spent_usdc,
    status = excluded.status,
    closed_at = excluded.closed_at,
    payload = excluded.payload
`);
const listMppByAgent = db.prepare(
  "SELECT payload FROM mpp_sessions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50",
);

const getEscrow = db.prepare(
  "SELECT escrow_id, buyer_agent_id, seller_agent_id, amount_usdc, condition_hash, status, created_at, released_at, payload FROM escrow_records WHERE escrow_id = ?",
);
const upsertEscrow = db.prepare(`
  INSERT INTO escrow_records (escrow_id, buyer_agent_id, seller_agent_id, amount_usdc, condition_hash, status, created_at, released_at, payload)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(escrow_id) DO UPDATE SET
    status = excluded.status,
    released_at = excluded.released_at,
    payload = excluded.payload
`);

export function saveMppSessionToDb(session: MppSession): void {
  const spent = session.callsUsed * session.avgPricePerCallUsdc;
  upsertMpp.run(
    session.sessionId,
    session.agentId,
    session.maxBudgetUsdc,
    spent,
    session.status,
    Math.floor(new Date(session.openedAt).getTime() / 1000),
    session.closedAt ? Math.floor(new Date(session.closedAt).getTime() / 1000) : null,
    JSON.stringify(session),
  );
}

export function loadMppSessionsFromDb(agentId?: string): MppSession[] {
  if (!agentId) return [];
  const rows = listMppByAgent.all(agentId) as { payload: string }[];
  const out: MppSession[] = [];
  for (const row of rows) {
    try {
      out.push(JSON.parse(row.payload) as MppSession);
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

export function getMppSessionFromDb(sessionId: string): MppSession | null {
  const row = getMpp.get(sessionId) as { payload?: string } | undefined;
  if (!row?.payload) return null;
  try {
    return JSON.parse(row.payload) as MppSession;
  } catch {
    return null;
  }
}

export function saveEscrowToDb(record: EscrowRecord): void {
  upsertEscrow.run(
    record.id,
    record.payerAgentId,
    record.payeeAgentId,
    record.amountUsdc,
    record.releaseCondition.slice(0, 128),
    record.status,
    Math.floor(new Date(record.createdAt).getTime() / 1000),
    record.releasedAt ? Math.floor(new Date(record.releasedAt).getTime() / 1000) : null,
    JSON.stringify(record),
  );
}

export function getEscrowFromDb(id: string): EscrowRecord | null {
  const row = getEscrow.get(id) as { payload?: string } | undefined;
  if (!row?.payload) return null;
  try {
    return JSON.parse(row.payload) as EscrowRecord;
  } catch {
    return null;
  }
}
