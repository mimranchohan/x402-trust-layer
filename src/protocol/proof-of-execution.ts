import { hmacSign, sha256Hex } from "./crypto.js";
import { readProtocolStore, writeProtocolStore } from "./store.js";

export type ExecutionReceiptInput = {
  agentId: string;
  taskId?: string;
  targetUrl?: string;
  toolTrace?: Array<{ name: string; url?: string; amountUsdc?: number }>;
  decisionTrace?: string[];
  settlement?: {
    transactionHash?: string;
    network?: string;
    amountUsdc?: number;
  };
  responseSummary?: string;
};

export type ExecutionReceipt = {
  receiptId: string;
  taskId: string;
  executionHash: string;
  toolTraceHash: string;
  decisionTraceHash: string;
  verificationProof: string;
  settlementProof: string | null;
  issuedAt: string;
  thirdPartyVerifyUrl: string;
};

type ReceiptStore = Record<string, ExecutionReceipt & { signature: string; payload: string }>;

export async function issueExecutionReceipt(
  input: ExecutionReceiptInput,
  publicBaseUrl: string,
): Promise<ExecutionReceipt & { signature: string }> {
  const store = await readProtocolStore<ReceiptStore>("execution-receipts", {});
  const taskId = input.taskId ?? `task_${Date.now().toString(36)}`;
  const toolTraceJson = JSON.stringify(input.toolTrace ?? []);
  const decisionJson = JSON.stringify(input.decisionTrace ?? []);
  const executionHash = sha256Hex(
    `${input.agentId}:${taskId}:${input.targetUrl ?? ""}:${input.responseSummary ?? ""}`,
  );
  const toolTraceHash = sha256Hex(toolTraceJson);
  const decisionTraceHash = sha256Hex(decisionJson);
  const settlementProof = input.settlement?.transactionHash
    ? sha256Hex(JSON.stringify(input.settlement))
    : null;

  const receiptId = `poe_${sha256Hex(executionHash).slice(0, 16)}`;
  const verificationProof = hmacSign(
    `${receiptId}:${executionHash}:${toolTraceHash}:${decisionTraceHash}`,
  );

  const receipt: ExecutionReceipt = {
    receiptId,
    taskId,
    executionHash,
    toolTraceHash,
    decisionTraceHash,
    verificationProof,
    settlementProof,
    issuedAt: new Date().toISOString(),
    thirdPartyVerifyUrl: `${publicBaseUrl}/api/protocol/execution/verify`,
  };

  const payload = JSON.stringify(receipt);
  const signature = hmacSign(payload);
  store[receiptId] = { ...receipt, signature, payload };
  await writeProtocolStore("execution-receipts", store);
  return { ...receipt, signature };
}

export async function verifyExecutionReceipt(receiptId: string): Promise<{
  valid: boolean;
  receipt: ExecutionReceipt | null;
  reason?: string;
}> {
  const store = await readProtocolStore<ReceiptStore>("execution-receipts", {});
  const row = store[receiptId];
  if (!row) return { valid: false, receipt: null, reason: "Receipt not found" };
  const { signature, payload, ...receipt } = row;
  const expected = hmacSign(payload);
  if (expected !== signature) {
    return { valid: false, receipt, reason: "Receipt signature invalid" };
  }
  const recomputed = hmacSign(
    `${receipt.receiptId}:${receipt.executionHash}:${receipt.toolTraceHash}:${receipt.decisionTraceHash}`,
  );
  if (recomputed !== receipt.verificationProof) {
    return { valid: false, receipt, reason: "Verification proof mismatch" };
  }
  return { valid: true, receipt };
}
