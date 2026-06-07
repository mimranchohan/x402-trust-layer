import { decodeFunctionData, type Hex } from "viem";
import { runPayloadSandbox } from "./payload-sandbox.js";
import { runReceiptAuditor } from "./receipt-auditor.js";
import { recordSpend } from "../lib/ledger.js";
import { config } from "../config.js";

// Minimal ABI for ERC-4337 execution routing
const smartAccountAbi = [
  {
    name: "execute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" }
    ],
    outputs: []
  },
  {
    name: "executeBatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dest", type: "address[]" },
      { name: "value", type: "uint256[]" },
      { name: "func", type: "bytes[]" }
    ],
    outputs: []
  }
] as const;

function hexToString(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  try {
    return Buffer.from(clean, "hex").toString("utf8");
  } catch {
    return "";
  }
}

function decodeRevertReason(hex: string): string {
  if (!hex || hex === "0x") return "";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  // Error(string) selector: 08c379a0
  if (clean.startsWith("08c379a0")) {
    try {
      const lenHex = clean.slice(8 + 64, 8 + 64 + 64);
      const len = parseInt(lenHex, 16);
      if (Number.isNaN(len) || len <= 0) return "";
      const dataHex = clean.slice(8 + 64 + 64, 8 + 64 + 64 + len * 2);
      return Buffer.from(dataHex, "hex").toString("utf8");
    } catch {
      return "";
    }
  }
  // Panic(uint256) selector: 4e487b71
  if (clean.startsWith("4e487b71")) {
    try {
      const codeHex = clean.slice(8, 8 + 64);
      const code = parseInt(codeHex, 16);
      return `Panic(0x${code.toString(16)})`;
    } catch {
      return "";
    }
  }
  return "";
}

export type PaymasterPolicyInput = {
  userOperation: {
    sender: string;
    nonce: string;
    initCode: string;
    callData: string;
    callGasLimit: string;
    verificationGasLimit: string;
    preVerificationGas: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
    paymasterAndData: string;
    signature: string;
  };
  policyId: string;
  chainId: number | string;
  webhookData?: string;
};

export type NotifyWebhookInput = {
  webhookId: string;
  id: string;
  createdAt: string;
  type: string;
  event: {
    network: string;
    activity: Array<{
      blockNum: string;
      hash: string;
      fromAddress: string;
      toAddress: string;
      value: number;
      asset: string;
      category: string;
      rawContract?: {
        rawValue: string;
        address: string;
        decimal: number;
      };
    }>;
  };
};

export type SimulationShieldInput = {
  agentId: string;
  transaction: {
    from: string;
    to: string;
    data: string;
    value?: string;
  };
  chainId: number;
};

/**
 * POST /api/alchemy/paymaster-policy
 * Decodes ERC-4337 callData and runs sandbox checks.
 */
export async function runAlchemyPaymasterPolicy(
  input: PaymasterPolicyInput
): Promise<{ approved: boolean; reason?: string }> {
  const { callData } = input.userOperation;
  if (!callData || callData === "0x") {
    return { approved: true };
  }

  let calls: Array<{ dest: string; value: bigint; func: string }> = [];

  try {
    const decoded = decodeFunctionData({
      abi: smartAccountAbi,
      data: callData as Hex,
    });

    if (decoded.functionName === "execute") {
      const [dest, val, func] = decoded.args;
      calls.push({ dest, value: val, func });
    } else if (decoded.functionName === "executeBatch") {
      const [dests, vals, funcs] = decoded.args;
      for (let i = 0; i < dests.length; i++) {
        calls.push({
          dest: dests[i],
          value: vals[i],
          func: funcs[i],
        });
      }
    }
  } catch {
    // Fallback: Check raw callData hex converted to string
    const rawStr = hexToString(callData);
    const sandbox = await runPayloadSandbox({
      agentId: `paymaster:${input.policyId}`,
      payload: { rawCallData: rawStr },
    });
    if (!sandbox.allowed) {
      return {
        approved: false,
        reason: `Malicious command pattern detected in raw callData: ${sandbox.summary}`,
      };
    }
    return { approved: true };
  }

  // Check each sub-call decoded from execute/executeBatch
  for (const call of calls) {
    const funcStr = hexToString(call.func);
    const sandbox = await runPayloadSandbox({
      agentId: `paymaster:${input.policyId}`,
      payload: {
        targetContract: call.dest,
        value: call.value.toString(),
        decodedFunctionCall: funcStr,
      },
    });

    if (!sandbox.allowed) {
      return {
        approved: false,
        reason: `Security threat block: ${sandbox.summary}`,
      };
    }
  }

  return { approved: true };
}

/**
 * POST /api/alchemy/notify-webhook
 * Receives address activity notifications and performs audits.
 */
export async function runAlchemyNotifyWebhook(
  input: NotifyWebhookInput
): Promise<{ ok: boolean; processedCount: number }> {
  let count = 0;
  for (const activity of input.event.activity) {
    // Run audit using standard receipt-auditor
    const audit = await runReceiptAuditor({
      transactionHash: activity.hash,
      network: input.event.network,
      payTo: activity.toAddress,
      expectedAmountUsdc: activity.asset === "USDC" ? activity.value : undefined,
      settlement: {
        transaction: activity.hash,
        amountUsdc: activity.asset === "USDC" ? activity.value : 0,
        network: input.event.network,
      },
    });

    if (audit.valid) {
      // Record in compliance/spend ledger compatible with both JSON & SQLite backends
      const agentId = `alchemy-notify:${input.webhookId}`;
      const amountUsdc = activity.asset === "USDC" ? activity.value : 0;
      await recordSpend(agentId, amountUsdc);
      count++;
    }
  }

  return { ok: true, processedCount: count };
}

/**
 * POST /api/alchemy/simulate-shield
 * Simulates EVM transaction execution and flags threat vectors before submission.
 */
export async function runAlchemySimulationShield(
  input: SimulationShieldInput
): Promise<{
  safe: boolean;
  reverted: boolean;
  summary: string;
  assetChanges: any[];
  detectedThreats: string[];
  securityGrade: "A" | "B" | "C" | "D" | "F";
}> {
  const apiKey = config.alchemyApiKey || "HquPA1xEaOM6X8JY3WeAy";
  const chainId = input.chainId;

  // Resolve Alchemy endpoint based on chainId
  let networkName = "base-mainnet";
  if (chainId === 1) networkName = "eth-mainnet";
  else if (chainId === 137) networkName = "polygon-mainnet";
  else if (chainId === 8453) networkName = "base-mainnet";

  const url = `https://${networkName}.g.alchemy.com/v2/${apiKey}`;

  try {
    // 1. Fetch asset changes
    const assetChangesPromise = fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_simulateAssetChanges",
        params: [
          {
            from: input.transaction.from,
            to: input.transaction.to,
            value: input.transaction.value || "0x0",
            data: input.transaction.data || "0x",
          },
        ],
      }),
    });

    // 2. Fetch execution simulation (revert checks)
    const executionPromise = fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "alchemy_simulateExecution",
        params: [
          "FLAT",
          {
            from: input.transaction.from,
            to: input.transaction.to,
            value: input.transaction.value || "0x0",
            data: input.transaction.data || "0x",
          },
          "latest",
        ],
      }),
    });

    const [resChanges, resExec] = await Promise.all([assetChangesPromise, executionPromise]);
    if (!resChanges.ok || !resExec.ok) {
      throw new Error(`Alchemy simulation RPC error (HTTP ${resChanges.status}/${resExec.status})`);
    }

    const jsonChanges = (await resChanges.json()) as any;
    const jsonExec = (await resExec.json()) as any;

    const changes = jsonChanges.result?.changes || [];
    let errorMsg = jsonExec.result?.error || jsonExec.error?.message || "";
    const revertReasonHex = jsonExec.result?.revertReason || "";
    const reverted = Boolean(errorMsg || revertReasonHex);

    if (reverted && revertReasonHex) {
      const decoded = decodeRevertReason(revertReasonHex);
      if (decoded) {
        errorMsg = errorMsg ? `${errorMsg}: ${decoded}` : decoded;
      }
    }

    const detectedThreats: string[] = [];

    if (reverted) {
      detectedThreats.push("simulation_revert");
    }

    // Heuristic security checks
    let totalOutflowValue = 0;
    for (const change of changes) {
      if (change.changeType === "TRANSFER" && change.from.toLowerCase() === input.transaction.from.toLowerCase()) {
        if (change.assetType === "ERC20" && change.symbol === "USDC") {
          totalOutflowValue += Number(change.amount || 0);
        }
      }
    }

    if (totalOutflowValue > 100) {
      detectedThreats.push("high_value_outflow");
    }

    // Scan the transaction input data for prompt/payload injections
    const dataStr = hexToString(input.transaction.data);
    const sandbox = await runPayloadSandbox({
      agentId: input.agentId,
      payload: { transactionData: dataStr },
    });

    if (!sandbox.allowed) {
      detectedThreats.push("payload_threat_detected");
    }

    const safe = detectedThreats.length === 0;
    let securityGrade: "A" | "B" | "C" | "D" | "F" = "A";

    if (detectedThreats.includes("payload_threat_detected")) securityGrade = "F";
    else if (reverted) securityGrade = "D";
    else if (detectedThreats.includes("high_value_outflow")) securityGrade = "B";

    const summary = safe
      ? "Transaction simulation succeeded. No potential drain or threat vectors detected."
      : reverted && errorMsg
      ? `Transaction reverted: ${errorMsg}`
      : `Threat vectors identified: ${detectedThreats.join(", ")}.`;

    return {
      safe,
      reverted,
      summary,
      assetChanges: changes,
      detectedThreats,
      securityGrade,
    };
  } catch (err: any) {
    return {
      safe: false,
      reverted: true,
      summary: `Failed to complete transaction simulation: ${err?.message || String(err)}`,
      assetChanges: [],
      detectedThreats: ["simulation_failed"],
      securityGrade: "F",
    };
  }
}
