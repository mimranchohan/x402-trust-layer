import { config } from "../config.js";
import type { ReceiptAuditorInput } from "../types.js";

export type ReceiptAuditorResult = {
  valid: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  explorerUrl: string | null;
};

async function fetchBaseTxReceipt(txHash: string): Promise<{ status: string; to: string | null } | null> {
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

export async function runReceiptAuditor(input: ReceiptAuditorInput): Promise<ReceiptAuditorResult> {
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
    return { valid: false, checks, explorerUrl: null };
  }

  checks.push({ name: "transaction_present", passed: true, detail: tx });

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
    } else {
      checks.push({
        name: "on_chain_status",
        passed: false,
        detail: "Could not fetch Base receipt (check BASE_RPC_URL)",
      });
    }
  } else if (net.includes("solana")) {
    explorerUrl = `https://solscan.io/tx/${tx}`;
    checks.push({
      name: "on_chain_status",
      passed: false,
      detail:
        "Solana on-chain verification not enabled — use explorer URL manually; do not treat as settled",
    });
  }

  const valid = checks.every((c) => c.passed);
  return { valid, checks, explorerUrl };
}
