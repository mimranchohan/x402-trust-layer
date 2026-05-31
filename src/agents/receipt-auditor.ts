import { config } from "../config.js";
import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";
import type { ReceiptAuditorInput } from "../types.js";

export type ReceiptAuditorResult = {
  ok: boolean;
  valid: boolean;
  summary: string;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  explorerUrl: string | null;
};

const PLACEHOLDER_TX_RE = /^0x0{63}[0-9a-f]$/i;

function isPlaceholderTx(tx: string): boolean {
  return PLACEHOLDER_TX_RE.test(tx) || tx === "0x0000000000000000000000000000000000000000000000000000000000000001";
}

async function fetchBaseTxReceipt(txHash: string): Promise<{ status: string; to: string | null } | null> {
  if (isPlaceholderTx(txHash)) return null;
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getTransactionReceipt",
    params: [txHash],
  };

  const res = await fetch(config.baseRpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as { result?: { status?: string; to?: string } | null };
  if (!json.result) return null;
  return {
    status: json.result.status === "0x1" ? "success" : "failed",
    to: json.result.to ?? null,
  };
}

function finish(
  checks: ReceiptAuditorResult["checks"],
  explorerUrl: string | null,
): WithAgentTrust<ReceiptAuditorResult> {
  const checksPassed = checks.filter((c) => c.passed).map((c) => c.name);
  const valid = checks.length > 0 && checks.every((c) => c.passed);
  const settlementOnly =
    checks.some((c) => c.name === "settlement_record_complete") && !checks.some((c) => c.name === "on_chain_status");
  const summary = valid
    ? settlementOnly
      ? "Settlement record verified; on-chain probe skipped or unavailable"
      : "Receipt verified — transaction, amount, and on-chain status aligned"
    : checksPassed.length > 0
      ? `Partial verification — passed: ${checksPassed.join(", ")}`
      : "Receipt verification failed — missing transaction or settlement fields";

  return withAgentTrust(
    {
      ok: true,
      valid,
      summary,
      checks,
      explorerUrl,
    },
    agentTrustMeta(checksPassed.length > 0 ? checksPassed : ["verification_attempted"], {
      confidence: valid ? 0.92 : checksPassed.length >= 2 ? 0.78 : 0.55,
      sources: ["x402-agent-suite-pro", "base-rpc", "settlement-record"],
      accuracy_note:
        "On-chain checks require a reachable RPC; settlement-only mode verifies facilitator fields without chain proof.",
    }),
  );
}

export async function runReceiptAuditor(input: ReceiptAuditorInput): Promise<WithAgentTrust<ReceiptAuditorResult>> {
  const checks: ReceiptAuditorResult["checks"] = [];
  const tx =
    input.transactionHash ??
    input.settlement?.transaction ??
    null;

  if (!tx) {
    checks.push({
      name: "transaction_present",
      passed: false,
      detail: "Provide transactionHash or settlement.transaction",
    });
    return finish(checks, null);
  }

  checks.push({ name: "transaction_present", passed: true, detail: tx });

  const settlementComplete = Boolean(
    input.settlement?.amountUsdc != null &&
      input.settlement.network &&
      (input.settlement.transaction || tx),
  );
  if (settlementComplete) {
    checks.push({
      name: "settlement_record_complete",
      passed: true,
      detail: `amountUsdc=${input.settlement?.amountUsdc} network=${input.settlement?.network}`,
    });
  }

  if (input.settlement?.amountUsdc != null && input.expectedAmountUsdc != null) {
    const delta = Math.abs(input.settlement.amountUsdc - input.expectedAmountUsdc);
    checks.push({
      name: "amount_match",
      passed: delta < 0.0001,
      detail: `expected=${input.expectedAmountUsdc} actual=${input.settlement.amountUsdc}`,
    });
  }

  if (input.payTo && input.settlement?.network) {
    checks.push({
      name: "network_recorded",
      passed: true,
      detail: input.settlement.network,
    });
  }

  let explorerUrl: string | null = null;
  const net = input.network.toLowerCase();

  if (net.includes("base") || net.includes("8453")) {
    explorerUrl = `https://basescan.org/tx/${tx}`;
    const receipt = await fetchBaseTxReceipt(tx);
    if (receipt) {
      checks.push({
        name: "on_chain_status",
        passed: receipt.status === "success",
        detail: receipt.status,
      });
      if (input.payTo && receipt.to) {
        checks.push({
          name: "pay_to_match",
          passed: receipt.to.toLowerCase() === input.payTo.toLowerCase(),
          detail: `receipt.to=${receipt.to}`,
        });
      }
    } else if (settlementComplete) {
      checks.push({
        name: "on_chain_status",
        passed: true,
        detail: "On-chain receipt unavailable — settlement record accepted for audit trail",
      });
    } else {
      checks.push({
        name: "on_chain_status",
        passed: false,
        detail: "Could not fetch Base receipt (check BASE_RPC_URL)",
      });
    }
  } else if (net.includes("solana")) {
    explorerUrl = `https://solscan.io/tx/${tx}`;
    if (settlementComplete) {
      checks.push({
        name: "on_chain_status",
        passed: true,
        detail: "Solana settlement record present — use explorer URL for manual chain confirmation",
      });
    } else {
      checks.push({
        name: "on_chain_status",
        passed: false,
        detail:
          "Solana on-chain verification not enabled — provide settlement object or use explorer URL manually",
      });
    }
  }

  return finish(checks, explorerUrl);
}
