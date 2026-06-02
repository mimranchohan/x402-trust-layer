import { merkleRoot, sha256Hex, hmacSign } from "./crypto.js";
import { readProtocolStore, writeProtocolStore } from "./store.js";

export type ReasoningCommitInput = {
  agentId: string;
  sessionId?: string;
  toolCalls: Array<{ name: string; argsHash?: string }>;
  policyChecks: string[];
  promptHashes: string[];
  riskAnalysis?: string;
  decisionGraph?: Record<string, unknown>;
};

export type ReasoningCommitResult = {
  auditId: string;
  merkleRoot: string;
  leafCount: number;
  committedAt: string;
  zkReady: boolean;
  disclosureHint: string;
};

type AuditStore = Record<
  string,
  {
    merkleRoot: string;
    leaves: string[];
    agentId: string;
    committedAt: string;
    signature: string;
  }
>;

export async function commitReasoningAudit(input: ReasoningCommitInput): Promise<ReasoningCommitResult> {
  const leaves: string[] = [];
  for (const t of input.toolCalls) {
    leaves.push(sha256Hex(`tool:${t.name}:${t.argsHash ?? ""}`));
  }
  for (const p of input.promptHashes) {
    leaves.push(sha256Hex(`prompt:${p}`));
  }
  for (const c of input.policyChecks) {
    leaves.push(sha256Hex(`policy:${c}`));
  }
  if (input.riskAnalysis) leaves.push(sha256Hex(`risk:${input.riskAnalysis}`));
  if (input.decisionGraph) leaves.push(sha256Hex(`graph:${JSON.stringify(input.decisionGraph)}`));

  const root = merkleRoot(leaves);
  const auditId = `aud_${sha256Hex(root).slice(0, 16)}`;
  const store = await readProtocolStore<AuditStore>("reasoning-audits", {});
  store[auditId] = {
    merkleRoot: root,
    leaves,
    agentId: input.agentId,
    committedAt: new Date().toISOString(),
    signature: hmacSign(`${auditId}:${root}`),
  };
  await writeProtocolStore("reasoning-audits", store);

  return {
    auditId,
    merkleRoot: root,
    leafCount: leaves.length,
    committedAt: store[auditId]!.committedAt,
    zkReady: true,
    disclosureHint: "Use POST /api/protocol/reasoning/disclose with leaf indices for selective reveal",
  };
}

export async function selectiveDisclose(
  auditId: string,
  leafIndices: number[],
): Promise<{
  ok: boolean;
  disclosed: string[];
  merkleProof: string[];
  reason?: string;
}> {
  const store = await readProtocolStore<AuditStore>("reasoning-audits", {});
  const row = store[auditId];
  if (!row) return { ok: false, disclosed: [], merkleProof: [], reason: "Audit not found" };

  const disclosed = leafIndices
    .filter((i) => i >= 0 && i < row.leaves.length)
    .map((i) => row.leaves[i]!);

  return {
    ok: true,
    disclosed,
    merkleProof: [row.merkleRoot, ...disclosed],
  };
}
