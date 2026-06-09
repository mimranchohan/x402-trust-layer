import { verifyMandate, type MandateCheck } from "../lib/mandate.js";
import { hostOf } from "../lib/probe.js";
import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";

export type ToolCallTrace = {
  name: string;
  url?: string;
  amountUsdc?: number;
  merchant?: string;
  category?: string;
  rail?: string;
  argsSummary?: string;
};

export type MandateDiffInput = {
  mandateId: string;
  toolCalls: ToolCallTrace[];
  /** Optional aggregate payment the agent is about to authorize */
  proposed?: MandateCheck;
  /** Human-readable task for semantic drift checks */
  task?: string;
};

type DiffViolation = {
  code: string;
  severity: "block" | "step_up";
  message: string;
  evidence?: string;
};

const AFFILIATE_HINTS = /[?&](aff|ref|utm_|affiliate)=/i;
const SUSPICIOUS_DOMAINS = /scam|phish|invalid|fake-wallet/i;

function tierFromViolations(violations: DiffViolation[]): "allow" | "step_up" | "block" {
  if (violations.some((v) => v.severity === "block")) return "block";
  if (violations.length > 0) return "step_up";
  return "allow";
}

/**
 * Intent Diff Engine — compares a signed mandate scope to the actual MCP/tool trace
 * before x402 payment. Rules-first (auditable); complements t54 behavioral risk.
 */
export async function runMandateDiff(input: MandateDiffInput) {
  const violations: DiffViolation[] = [];
  const signals: string[] = [];

  const mandateResult = await verifyMandate(input.mandateId, input.proposed);
  if (!mandateResult.valid) {
    violations.push({
      code: "mandate_invalid",
      severity: "block",
      message: mandateResult.reason,
    });
    return withAgentTrust(
      {
        ok: true,
        allowed: false,
        liabilityTier: "block",
        mandateValid: false,
        withinMandateScope: false,
        violations,
        signals,
        mandateId: input.mandateId,
        toolCallCount: input.toolCalls.length,
        summary: "Mandate invalid — do not pay",
      },
      agentTrustMeta(["mandate_invalid"], { confidence: 0.95, sources: ["mandate-diff"] }),
    );
  }

  if (!mandateResult.withinScope && input.proposed) {
    for (const v of mandateResult.violations) {
      violations.push({ code: "scope_violation", severity: "block", message: v });
    }
  }

  const scope = mandateResult.record?.scope;
  const allowedMerchants = scope?.allowedMerchants ?? [];
  const allowedCategories = scope?.allowedCategories ?? [];
  const allowedRails = scope?.allowedRails ?? [];
  const maxPerTx = scope?.maxPerTxUsdc ?? Infinity;

  for (const [i, call] of input.toolCalls.entries()) {
    const label = `toolCalls[${i}]`;
    if (call.url) {
      if (SUSPICIOUS_DOMAINS.test(call.url)) {
        violations.push({
          code: "suspicious_url",
          severity: "block",
          message: `${label}: URL matches suspicious pattern`,
          evidence: call.url,
        });
      }
      if (AFFILIATE_HINTS.test(call.url)) {
        violations.push({
          code: "affiliate_redirect",
          severity: "step_up",
          message: `${label}: affiliate/tracking params in URL — possible prompt-injected routing`,
          evidence: call.url,
        });
      }
      const host = hostOf(call.url);
      if (
        allowedMerchants.length > 0 &&
        host &&
        !allowedMerchants.some((m) => host.includes(m.toLowerCase()) || call.url!.toLowerCase().includes(m.toLowerCase()))
      ) {
        violations.push({
          code: "merchant_not_in_mandate",
          severity: "block",
          message: `${label}: host ${host} not in allowedMerchants`,
          evidence: call.url,
        });
      }
    }
    if (call.merchant && allowedMerchants.length > 0) {
      if (!allowedMerchants.some((m) => call.merchant!.toLowerCase().includes(m.toLowerCase()))) {
        violations.push({
          code: "merchant_not_in_mandate",
          severity: "block",
          message: `${label}: merchant ${call.merchant} not in allowedMerchants`,
        });
      }
    }
    if (call.category && allowedCategories.length > 0 && !allowedCategories.includes(call.category)) {
      violations.push({
        code: "category_not_in_mandate",
        severity: "block",
        message: `${label}: category ${call.category} not in allowedCategories`,
      });
    }
    if (call.rail && allowedRails.length > 0 && !allowedRails.includes(call.rail)) {
      violations.push({
        code: "rail_not_in_mandate",
        severity: "block",
        message: `${label}: rail ${call.rail} not in allowedRails`,
      });
    }
    if (typeof call.amountUsdc === "number" && call.amountUsdc > maxPerTx) {
      violations.push({
        code: "amount_exceeds_mandate",
        severity: "block",
        message: `${label}: amount ${call.amountUsdc} exceeds maxPerTxUsdc ${maxPerTx}`,
      });
    }
    if (call.argsSummary && /prefer store|rewrite url|ignore mandate|override/i.test(call.argsSummary)) {
      violations.push({
        code: "instruction_tampering",
        severity: "block",
        message: `${label}: tool args suggest non-mandated instruction override`,
        evidence: call.argsSummary.slice(0, 120),
      });
    }
  }

  if (input.task && mandateResult.record?.intent) {
    const intent = mandateResult.record.intent.toLowerCase();
    const task = input.task.toLowerCase();
    const intentTokens = intent.split(/\W+/).filter((t) => t.length > 3);
    const overlap = intentTokens.filter((t) => task.includes(t)).length;
    if (intentTokens.length >= 3 && overlap < Math.ceil(intentTokens.length * 0.2)) {
      violations.push({
        code: "task_intent_drift",
        severity: "step_up",
        message: "Current task text diverges from signed mandate intent — human confirm recommended",
      });
    } else {
      signals.push("Task text loosely aligns with mandate intent");
    }
  }

  const liabilityTier = tierFromViolations(violations);
  const allowed = liabilityTier === "allow";
  const withinMandateScope = mandateResult.withinScope && violations.every((v) => v.severity !== "block");

  return withAgentTrust(
    {
      ok: true,
      allowed,
      liabilityTier,
      mandateValid: true,
      withinMandateScope,
      mandateId: input.mandateId,
      toolCallCount: input.toolCalls.length,
      violations,
      signals,
      mandateIntent: mandateResult.record?.intent ?? null,
      proposed: input.proposed ?? null,
      summary:
        liabilityTier === "allow"
          ? "Tool trace within mandate scope — proceed to x402 payment"
          : liabilityTier === "step_up"
            ? "Non-blocking drift detected — step-up auth before payment"
            : "Blocking violations — do not pay",
      nextStep:
        liabilityTier === "block"
          ? { method: "POST", path: "/api/mandate/verify", note: "Re-compile mandate or fix tool trace" }
          : liabilityTier === "step_up"
            ? { method: "POST", path: "/api/attestation/issue", note: "Issue fresh attestation after human confirm" }
            : null,
    },
    agentTrustMeta(
      allowed
        ? ["mandate_ok", "trace_ok"]
        : liabilityTier === "step_up"
          ? ["mandate_ok", "trace_drift"]
          : ["mandate_ok", "trace_blocked"],
      {
        confidence: 0.9,
        sources: ["mandate-diff", "ap2-aligned"],
        accuracy_note:
          "Diff is rules-based on supplied toolCalls; integrator must capture faithful MCP/browser traces.",
      },
    ),
  );
}
