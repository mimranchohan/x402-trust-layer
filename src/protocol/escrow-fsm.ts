import { randomUUID } from "node:crypto";
import { hmacSign } from "./crypto.js";
import { recordEscrowTransition, syncProtocolEscrow } from "../lib/escrow-unified.js";
import { readProtocolStore, writeProtocolStore } from "./store.js";

export const ESCROW_STATES = [
  "CREATED",
  "FUNDED",
  "LOCKED",
  "EXECUTING",
  "DELIVERED",
  "VERIFIED",
  "SETTLED",
  "REFUNDED",
  "DISPUTED",
  "CANCELLED",
] as const;

export type EscrowState = (typeof ESCROW_STATES)[number];

const VALID_TRANSITIONS: Record<EscrowState, EscrowState[]> = {
  CREATED: ["FUNDED", "CANCELLED"],
  FUNDED: ["LOCKED", "CANCELLED"],
  LOCKED: ["EXECUTING", "DISPUTED", "CANCELLED"],
  EXECUTING: ["DELIVERED", "DISPUTED", "CANCELLED"],
  DELIVERED: ["VERIFIED", "DISPUTED"],
  VERIFIED: ["SETTLED", "REFUNDED", "DISPUTED"],
  SETTLED: [],
  REFUNDED: [],
  DISPUTED: ["SETTLED", "REFUNDED", "CANCELLED"],
  CANCELLED: [],
};

export type ProtocolEscrow = {
  escrowId: string;
  payerAgentId: string;
  payeeMerchant: string;
  amountUsdc: number;
  state: EscrowState;
  resourceHash?: string;
  sessionId?: string;
  multiSigRecovery?: string[];
  history: Array<{ state: EscrowState; at: string; note?: string }>;
  createdAt: string;
  updatedAt: string;
  stateProof: string;
};

type EscrowStore = Record<string, ProtocolEscrow>;

export async function createProtocolEscrow(input: {
  payerAgentId: string;
  payeeMerchant: string;
  amountUsdc: number;
  resourceHash?: string;
  sessionId?: string;
}): Promise<ProtocolEscrow> {
  const store = await readProtocolStore<EscrowStore>("escrow-fsm", {});
  const escrowId = randomUUID();
  const now = new Date().toISOString();
  const escrow: ProtocolEscrow = {
    escrowId,
    payerAgentId: input.payerAgentId,
    payeeMerchant: input.payeeMerchant,
    amountUsdc: input.amountUsdc,
    state: "CREATED",
    resourceHash: input.resourceHash,
    sessionId: input.sessionId,
    history: [{ state: "CREATED", at: now }],
    createdAt: now,
    updatedAt: now,
    stateProof: "",
  };
  escrow.stateProof = hmacSign(`${escrowId}:${escrow.state}:${now}`);
  store[escrowId] = escrow;
  await writeProtocolStore("escrow-fsm", store);
  syncProtocolEscrow({
    escrowId,
    payerAgentId: input.payerAgentId,
    payeeId: input.payeeMerchant,
    amountUsdc: input.amountUsdc,
    state: escrow.state,
    resourceHash: input.resourceHash,
    sessionId: input.sessionId,
    stateProof: escrow.stateProof,
    metadata: { source: "protocol-fsm" },
  });
  return escrow;
}

export async function transitionEscrow(
  escrowId: string,
  nextState: EscrowState,
  note?: string,
): Promise<{ ok: boolean; escrow?: ProtocolEscrow; error?: string }> {
  const store = await readProtocolStore<EscrowStore>("escrow-fsm", {});
  const escrow = store[escrowId];
  if (!escrow) return { ok: false, error: "Escrow not found" };

  const allowed = VALID_TRANSITIONS[escrow.state];
  if (!allowed.includes(nextState)) {
    return {
      ok: false,
      error: `Invalid transition ${escrow.state} -> ${nextState}`,
    };
  }

  const now = new Date().toISOString();
  const fromState = escrow.state;
  escrow.state = nextState;
  escrow.updatedAt = now;
  escrow.history.push({ state: nextState, at: now, note });
  escrow.stateProof = hmacSign(`${escrowId}:${nextState}:${now}`);
  store[escrowId] = escrow;
  await writeProtocolStore("escrow-fsm", store);
  recordEscrowTransition(escrowId, fromState, nextState, note, escrow.stateProof);
  syncProtocolEscrow({
    escrowId,
    payerAgentId: escrow.payerAgentId,
    payeeId: escrow.payeeMerchant,
    amountUsdc: escrow.amountUsdc,
    state: nextState,
    resourceHash: escrow.resourceHash,
    sessionId: escrow.sessionId,
    stateProof: escrow.stateProof,
    metadata: { source: "protocol-fsm", historyLen: escrow.history.length },
  });
  return { ok: true, escrow };
}

export async function getEscrowStatus(escrowId: string): Promise<ProtocolEscrow | null> {
  const store = await readProtocolStore<EscrowStore>("escrow-fsm", {});
  return store[escrowId] ?? null;
}
