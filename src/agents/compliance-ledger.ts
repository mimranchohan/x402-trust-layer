import { createHash } from "node:crypto";
import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";

export type ComplianceRecord = {
  merchant: string;
  endpoint?: string;
  amountUsdc: number;
  rail?: string;
  network?: string;
  category?: string;
  agentId?: string;
  transactionHash?: string;
  timestamp?: string;
};

export type CompliancePolicy = {
  monthlyCapUsdc?: number;
  perMerchantCapUsdc?: number;
  disallowedCategories?: string[];
  requireTxHash?: boolean;
};

export type ComplianceLedgerInput = {
  organizationId: string;
  period?: string;
  records: ComplianceRecord[];
  policy?: CompliancePolicy;
};

function group<T extends string>(rows: ComplianceRecord[], key: (r: ComplianceRecord) => T) {
  const out: Record<string, { count: number; totalUsdc: number }> = {};
  for (const r of rows) {
    const k = key(r) || "unknown";
    out[k] ??= { count: 0, totalUsdc: 0 };
    out[k].count += 1;
    out[k].totalUsdc = Number((out[k].totalUsdc + r.amountUsdc).toFixed(6));
  }
  return out;
}

/**
 * CFO-grade Spend Compliance & Audit agent.
 * Reconciles a fleet's agentic spend into a tamper-evident, SOC2/tax-ready
 * ledger: spend by merchant/category/rail/agent, policy-violation flags, and
 * a deterministic ledger hash. Complements evidence-locker (raw bundle export)
 * with the analytics + reconciliation layer enterprises actually file.
 */
export function runComplianceLedger(input: ComplianceLedgerInput) {
  const rows = input.records;
  const totalUsdc = Number(rows.reduce((a, r) => a + r.amountUsdc, 0).toFixed(6));
  const policy = input.policy ?? {};

  const byMerchant = group(rows, (r) => r.merchant ?? r.endpoint ?? "unknown");
  const byCategory = group(rows, (r) => r.category ?? "uncategorized");
  const byRail = group(rows, (r) => r.rail ?? r.network ?? "unknown");
  const byAgent = group(rows, (r) => r.agentId ?? "unknown");

  const violations: { type: string; detail: string }[] = [];

  if (policy.monthlyCapUsdc != null && totalUsdc > policy.monthlyCapUsdc) {
    violations.push({ type: "monthly_cap", detail: `Total $${totalUsdc} exceeds monthly cap $${policy.monthlyCapUsdc}` });
  }
  if (policy.perMerchantCapUsdc != null) {
    for (const [m, agg] of Object.entries(byMerchant)) {
      if (agg.totalUsdc > policy.perMerchantCapUsdc) {
        violations.push({ type: "per_merchant_cap", detail: `${m}: $${agg.totalUsdc} > $${policy.perMerchantCapUsdc}` });
      }
    }
  }
  if (policy.disallowedCategories?.length) {
    for (const cat of policy.disallowedCategories) {
      if (byCategory[cat]) violations.push({ type: "disallowed_category", detail: `Category ${cat} present ($${byCategory[cat].totalUsdc})` });
    }
  }

  const unreconciled = policy.requireTxHash
    ? rows.filter((r) => !r.transactionHash).length
    : rows.filter((r) => !r.transactionHash).length;

  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    period: input.period ?? null,
    records: rows.map((r) => ({
      merchant: r.merchant ?? r.endpoint,
      amountUsdc: r.amountUsdc,
      rail: r.rail ?? r.network,
      txHash: r.transactionHash ?? null,
      ts: r.timestamp ?? null,
    })),
  });
  const ledgerHash = createHash("sha256").update(canonical).digest("hex");

  return withAgentTrust(
    {
      organizationId: input.organizationId,
      period: input.period ?? "unspecified",
      summary: {
        recordCount: rows.length,
        totalUsdc,
        averageUsdc: rows.length ? Number((totalUsdc / rows.length).toFixed(6)) : 0,
        unreconciledRecords: unreconciled,
        policyCompliant: violations.length === 0,
      },
      breakdown: { byMerchant, byCategory, byRail, byAgent },
      violations,
      ledgerHash,
      exportFormats: ["json", "csv-ready", "soc2-bundle"],
      auditNote:
        "Persist ledgerHash off-system; recompute to detect tampering. Pair with /api/evidence-locker/export for signed bundles.",
    },
    agentTrustMeta(["aggregation", "policy_eval", "tamper_hash"], {
      confidence: 0.9,
      sources: ["compliance-ledger"],
      accuracy_note:
        "Reconciliation is based on supplied records; on-chain verification of each txHash should be done via /api/receipt-auditor/verify.",
    }),
  );
}
