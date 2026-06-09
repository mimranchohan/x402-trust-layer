import { createEscrow, getEscrow, releaseEscrow } from "../lib/escrow-ledger.js";

export type EscrowInput =
  | {
      action: "create";
      payerAgentId: string;
      payeeAgentId: string;
      amountUsdc: number;
      releaseCondition: string;
      metadata?: Record<string, unknown>;
    }
  | { action: "status"; escrowId: string }
  | { action: "release"; escrowId: string };

export async function runAgentEscrow(input: EscrowInput) {
  if (input.action === "create") {
    const record = await createEscrow({
      payerAgentId: input.payerAgentId,
      payeeAgentId: input.payeeAgentId,
      amountUsdc: input.amountUsdc,
      releaseCondition: input.releaseCondition,
      metadata: input.metadata,
    });
    return { ok: true, escrow: record };
  }

  if (input.action === "status") {
    const record = await getEscrow(input.escrowId);
    if (!record) return { ok: false, error: "Escrow not found" };
    return { ok: true, escrow: record };
  }

  const record = await releaseEscrow(input.escrowId);
  if (!record) return { ok: false, error: "Escrow not found or not pending" };
  return { ok: true, escrow: record, message: "Escrow marked released. Execute USDC transfer via your agent wallet." };
}
