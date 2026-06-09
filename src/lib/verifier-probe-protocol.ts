import { VERIFY_EXAMPLES } from "./verify-examples.js";
import { hmacSign } from "../protocol/crypto.js";
import { readProtocolStore, writeProtocolStore } from "../protocol/store.js";
import type { AgentPassport } from "../protocol/agent-passport.js";

export const VERIFIER_PROBE_PASSPORT_DID = "did:agent:dexter_verifier_probe:0000000000000001";
export const VERIFIER_PROBE_RECEIPT_ID = "poe_verifier_probe_example";
export const VERIFIER_PROBE_AUDIT_ID = "aud_verifier_probe_example";
export const VERIFIER_PROBE_ESCROW_ID = "00000000-0000-4000-8000-000000000001";
export const VERIFIER_PROBE_BINDING_ID = "rb_verifier_probe_example";

async function seedPassport(): Promise<void> {
  type PassportStore = Record<string, AgentPassport>;
  const store = await readProtocolStore<PassportStore>("passports", {});
  if (store[VERIFIER_PROBE_PASSPORT_DID]) return;

  const payload = {
    did: VERIFIER_PROBE_PASSPORT_DID,
    agentId: "dexter-verifier-probe",
    publicKey: "probe_public_key",
    ownerIdentity: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
    capabilities: ["x402.pay", "x402.preflight", "tool.invoke"],
    permissions: ["spend:usdc", "attest:issue"],
    metadata: { probe: true },
    riskTier: "LOW" as const,
    reputationProfileId: "verifier_probe",
    issuedAt: new Date().toISOString(),
    credentialType: "AgentPassportVC" as const,
  };
  const signature = hmacSign(JSON.stringify(payload));
  store[VERIFIER_PROBE_PASSPORT_DID] = { ...payload, signature };
  await writeProtocolStore("passports", store);
}

async function seedExecutionReceipt(): Promise<void> {
  type ReceiptStore = Record<string, { signature: string; payload: string; receiptId: string }>;
  const store = await readProtocolStore<ReceiptStore>("execution-receipts", {});
  if (store[VERIFIER_PROBE_RECEIPT_ID]) return;

  const receipt = {
    receiptId: VERIFIER_PROBE_RECEIPT_ID,
    taskId: "verifier_probe_task",
    executionHash: "exec_verifier_probe_hash",
    toolTraceHash: "tool_verifier_probe_hash",
    decisionTraceHash: "decision_verifier_probe_hash",
    verificationProof: hmacSign(
      `${VERIFIER_PROBE_RECEIPT_ID}:exec_verifier_probe_hash:tool_verifier_probe_hash:decision_verifier_probe_hash`,
    ),
    settlementProof: null,
    issuedAt: new Date().toISOString(),
    thirdPartyVerifyUrl: "https://x402trustlayer.xyz/api/protocol/execution/verify",
  };
  const payload = JSON.stringify(receipt);
  store[VERIFIER_PROBE_RECEIPT_ID] = {
    ...receipt,
    signature: hmacSign(payload),
    payload,
  };
  await writeProtocolStore("execution-receipts", store);
}

async function seedReasoningAudit(): Promise<void> {
  type AuditStore = Record<
    string,
    { merkleRoot: string; leaves: string[]; agentId: string; committedAt: string; signature: string }
  >;
  const store = await readProtocolStore<AuditStore>("reasoning-audits", {});
  if (store[VERIFIER_PROBE_AUDIT_ID]) return;

  const root = hmacSign("verifier_probe_merkle_root");
  store[VERIFIER_PROBE_AUDIT_ID] = {
    merkleRoot: root,
    leaves: ["leaf_verifier_probe_0", "leaf_verifier_probe_1"],
    agentId: "dexter-verifier-probe",
    committedAt: new Date().toISOString(),
    signature: hmacSign(`${VERIFIER_PROBE_AUDIT_ID}:${root}`),
  };
  await writeProtocolStore("reasoning-audits", store);
}

async function seedEscrow(): Promise<void> {
  type EscrowStore = Record<string, unknown>;
  const store = await readProtocolStore<EscrowStore>("escrow-fsm", {});
  if (store[VERIFIER_PROBE_ESCROW_ID]) return;

  const ex = (VERIFY_EXAMPLES["/api/protocol/escrow/create"] || {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  store[VERIFIER_PROBE_ESCROW_ID] = {
    escrowId: VERIFIER_PROBE_ESCROW_ID,
    payerAgentId: String(ex.payerAgentId ?? "dexter-verifier-probe"),
    payeeMerchant: String(ex.payeeMerchant ?? "api.myceliasignal.com"),
    amountUsdc: Number(ex.amountUsdc ?? 0.08),
    state: "CREATED",
    resourceHash: String(ex.resourceHash ?? "res_verifier_probe"),
    history: [{ state: "CREATED", at: now }],
    createdAt: now,
    updatedAt: now,
    stateProof: hmacSign(`${VERIFIER_PROBE_ESCROW_ID}:CREATED:${now}`),
  };
  await writeProtocolStore("escrow-fsm", store);
}

async function seedReplayBinding(): Promise<void> {
  type BindingStore = Record<string, unknown>;
  const store = await readProtocolStore<BindingStore>("replay-bindings", {});
  if (store[VERIFIER_PROBE_BINDING_ID]) return;

  const ex = VERIFY_EXAMPLES["/api/protocol/replay/bind"] as Record<string, unknown>;
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  const payload = {
    bindingId: VERIFIER_PROBE_BINDING_ID,
    nonce: "nonce_verifier_probe",
    resourceHash: hmacSign(`POST:${String(ex.resourceUrl ?? "")}`),
    requestHash: hmacSign(JSON.stringify(ex.requestBody ?? {})),
    agentId: String(ex.agentId ?? "dexter-verifier-probe"),
    sessionId: "sess_verifier_probe",
    expiresAt,
  };
  store[VERIFIER_PROBE_BINDING_ID] = {
    ...payload,
    signature: hmacSign(JSON.stringify(payload)),
  };
  await writeProtocolStore("replay-bindings", store);
}

/** Stable protocol artifacts for x402gle verify-* paid probes. */
export async function ensureVerifierProbeProtocol(): Promise<void> {
  await seedPassport();
  await seedExecutionReceipt();
  await seedReasoningAudit();
  await seedEscrow();
  await seedReplayBinding();
}
