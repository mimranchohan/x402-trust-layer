import { db } from "./db.js";
import type { EscrowState } from "../protocol/escrow-fsm.js";
import type { EscrowRecord } from "./escrow-ledger.js";

const upsertEscrow = db.prepare(`
  INSERT INTO escrows (
    escrow_id, payer_agent_id, payee_id, amount_usdc, state,
    resource_hash, session_id, release_condition, quality_score,
    state_proof, metadata, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  ON CONFLICT(escrow_id) DO UPDATE SET
    state = excluded.state,
    state_proof = excluded.state_proof,
    metadata = excluded.metadata,
    updated_at = unixepoch(),
    settled_at = CASE WHEN excluded.state = 'SETTLED' THEN unixepoch() ELSE settled_at END
`);

const insertTransition = db.prepare(`
  INSERT INTO escrow_transitions (escrow_id, from_state, to_state, note, proof)
  VALUES (?, ?, ?, ?, ?)
`);

export function syncProtocolEscrow(input: {
  escrowId: string;
  payerAgentId: string;
  payeeId: string;
  amountUsdc: number;
  state: EscrowState | string;
  resourceHash?: string;
  sessionId?: string;
  stateProof: string;
  metadata?: Record<string, unknown>;
}): void {
  upsertEscrow.run(
    input.escrowId,
    input.payerAgentId,
    input.payeeId,
    input.amountUsdc,
    input.state,
    input.resourceHash ?? null,
    input.sessionId ?? null,
    null,
    null,
    input.stateProof,
    input.metadata ? JSON.stringify(input.metadata) : null,
  );
}

export function recordEscrowTransition(
  escrowId: string,
  fromState: string,
  toState: string,
  note?: string,
  proof?: string,
): void {
  insertTransition.run(escrowId, fromState, toState, note ?? null, proof ?? null);
}

export function syncLedgerEscrow(record: EscrowRecord): void {
  const state =
    record.status === "released" ? "SETTLED" : record.status === "cancelled" ? "CANCELLED" : "LOCKED";
  upsertEscrow.run(
    record.id,
    record.payerAgentId,
    record.payeeAgentId,
    record.amountUsdc,
    state,
    null,
    null,
    record.releaseCondition,
    null,
    `ledger:${record.status}`,
    JSON.stringify(record.metadata ?? {}),
  );
}
