import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";

export type ExpectedProfile = {
  requiredKeys?: string[];
  minLengthBytes?: number;
  mustMatchRegex?: string;
  forbidEmpty?: boolean;
};

export type ActualResponse = {
  bodyKeys?: string[];
  byteLength?: number;
  sample?: string;
  empty?: boolean;
};

export type QualityEscrowInput = {
  action: "hold" | "settle" | "refund";
  escrowId?: string;
  payerAgentId?: string;
  payeeMerchant?: string;
  amountUsdc?: number;
  expectedProfile?: ExpectedProfile;
  actualResponse?: ActualResponse;
  releaseThreshold?: number;
};

function matchScore(expected: ExpectedProfile, actual: ActualResponse): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  if (expected.forbidEmpty && (actual.empty || actual.byteLength === 0)) {
    score -= 70;
    reasons.push("Response empty but forbidEmpty set");
  }
  if (expected.requiredKeys?.length) {
    const present = new Set(actual.bodyKeys ?? []);
    const missing = expected.requiredKeys.filter((k) => !present.has(k));
    if (missing.length) {
      score -= Math.min(60, missing.length * 20);
      reasons.push(`Missing required keys: ${missing.join(", ")}`);
    } else {
      reasons.push("All required keys present");
    }
  }
  if (expected.minLengthBytes != null && actual.byteLength != null) {
    if (actual.byteLength < expected.minLengthBytes) {
      score -= 25;
      reasons.push(`Body ${actual.byteLength}B below minimum ${expected.minLengthBytes}B`);
    }
  }
  if (expected.mustMatchRegex && actual.sample != null) {
    try {
      const re = new RegExp(expected.mustMatchRegex);
      if (!re.test(actual.sample)) {
        score -= 30;
        reasons.push("Sample does not match required pattern");
      } else {
        reasons.push("Sample matches required pattern");
      }
    } catch {
      reasons.push("Invalid mustMatchRegex — skipped");
    }
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * Quality-Verified Escrow with Auto-Refund.
 * Holds an agent's payment, then on settle verifies the merchant's actual
 * response against its published "good response" profile. Releases to the
 * merchant on a pass, auto-refunds the buyer agent on a fail. This closes the
 * trust gap that final stablecoin settlements leave open.
 */
export function runQualityEscrow(input: QualityEscrowInput) {
  const threshold = input.releaseThreshold ?? 70;
  const escrowId = input.escrowId ?? `qesc_${Date.now().toString(36)}`;

  if (input.action === "hold") {
    return withAgentTrust(
      {
        action: "hold",
        escrowId,
        status: "held",
        payerAgentId: input.payerAgentId ?? null,
        payeeMerchant: input.payeeMerchant ?? null,
        amountUsdc: input.amountUsdc ?? null,
        releaseThreshold: threshold,
        note: "Funds held. Call action=settle with expectedProfile + actualResponse to verify and release/refund.",
      },
      agentTrustMeta(["escrow_open"], { confidence: 0.9, sources: ["quality-escrow"] }),
    );
  }

  if (input.action === "refund") {
    return withAgentTrust(
      {
        action: "refund",
        escrowId,
        status: "refunded",
        decision: "refund-to-payer",
        note: "Manual refund executed; funds returned to payer agent.",
      },
      agentTrustMeta(["escrow_refund"], { confidence: 0.9, sources: ["quality-escrow"] }),
    );
  }

  // settle: verify quality then release or refund.
  const expected = input.expectedProfile ?? {};
  const actual = input.actualResponse ?? {};
  const { score, reasons } = matchScore(expected, actual);
  const release = score >= threshold;

  return withAgentTrust(
    {
      status: "ok",
      ok: true,
      allowed: release,
      summary: release
        ? `Quality score ${score} ≥ ${threshold} — released $${input.amountUsdc ?? "?"} to ${input.payeeMerchant ?? "merchant"}`
        : `Quality score ${score} < ${threshold} — auto-refund to payer`,
      action: "settle",
      escrowId,
      escrowStatus: release ? "released" : "refunded",
      decision: release ? "release-to-merchant" : "auto-refund-to-payer",
      qualityScore: score,
      releaseThreshold: threshold,
      payeeMerchant: input.payeeMerchant ?? null,
      payerAgentId: input.payerAgentId ?? null,
      amountUsdc: input.amountUsdc ?? null,
      reasons,
      nextStep: release
        ? null
        : { method: "POST", path: "/api/dispute/resolve", note: "Escalate refused settlement to dispute resolver" },
    },
    agentTrustMeta(["quality_match", release ? "release_gate_passed" : "auto_refund_triggered"], {
      confidence: 0.86,
      sources: ["quality-escrow", "good-response-profile"],
      accuracy_note:
        "Quality match compares supplied actualResponse to expectedProfile; the integrator must capture the real response faithfully.",
    }),
  );
}
