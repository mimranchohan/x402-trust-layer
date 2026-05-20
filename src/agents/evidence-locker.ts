import { createHash } from "node:crypto";

export type SettlementRecord = {
  transactionHash?: string;
  endpoint: string;
  amountUsdc: number;
  payer?: string;
  network: string;
  timestamp?: string;
};

export type EvidenceLockerInput = {
  organizationId: string;
  records: SettlementRecord[];
};

export type EvidenceLockerResult = {
  bundleId: string;
  organizationId: string;
  generatedAt: string;
  recordCount: number;
  totalUsdc: number;
  checksum: string;
  export: {
    summary: string;
    records: SettlementRecord[];
    complianceNotes: string[];
  };
};

export function runEvidenceLocker(input: EvidenceLockerInput): EvidenceLockerResult {
  const total = input.records.reduce((s, r) => s + r.amountUsdc, 0);
  const payload = JSON.stringify(input.records);
  const checksum = createHash("sha256").update(payload).digest("hex");
  const bundleId = createHash("sha256")
    .update(`${input.organizationId}:${Date.now()}`)
    .digest("hex")
    .slice(0, 16);

  return {
    bundleId,
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    recordCount: input.records.length,
    totalUsdc: Number(total.toFixed(6)),
    checksum,
    export: {
      summary: `${input.records.length} x402 settlements totaling $${total.toFixed(4)} USDC`,
      records: input.records,
      complianceNotes: [
        "Immutable checksum covers record ordering and amounts",
        "Attach Receipt Auditor verification output per transaction for audit trail",
        "Suitable for internal finance review — not legal advice",
      ],
    },
  };
}
