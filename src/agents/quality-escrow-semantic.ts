import { runQualityEscrow, type ExpectedProfile, type ActualResponse } from "./quality-escrow.js";
import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";
import { runSemanticJudge } from "../lib/semantic-judge.js";
import { slashSellerBond, getCertifiedHost } from "../lib/certified-sellers.js";
import { hostOf } from "../lib/probe.js";

export type SemanticEscrowInput = {
  action?: "hold" | "settle" | "refund";
  escrowId?: string;
  payerAgentId?: string;
  payeeMerchant?: string;
  amountUsdc?: number;
  releaseThreshold?: number;
  /** What the buyer/agent expected semantically (e.g. "ETH/USD spot price number") */
  deliveryIntent: string;
  expectedProfile?: ExpectedProfile;
  actualResponse?: ActualResponse & {
    /** Parsed JSON fields when available */
    fields?: Record<string, unknown>;
  };
};

const PLACEHOLDER_VALUES = /^(null|undefined|n\/a|moon|test|foo|bar|xxx|-+)$/i;
const SUSPICIOUS_STRINGS = /lorem ipsum|click here|scam|free money/i;

async function computeSemanticScores(input: SemanticEscrowInput): Promise<{
  semanticScore: number;
  schemaScore: number;
  combinedScore: number;
  reasons: string[];
  judgeMode: "heuristic" | "llm";
}> {
  const fields = input.actualResponse?.fields ?? {};
  const sample = input.actualResponse?.sample ?? JSON.stringify(fields);

  const judge = await runSemanticJudge({
    deliveryIntent: input.deliveryIntent,
    sample,
    fields,
  });

  let semantic = judge.score;
  const reasons = [...judge.reasons];

  if (input.actualResponse?.empty || input.actualResponse?.byteLength === 0) {
    semantic = Math.min(semantic, 15);
    reasons.push("Empty response body");
  }

  for (const [key, val] of Object.entries(fields)) {
    const s = String(val);
    if (PLACEHOLDER_VALUES.test(s)) {
      semantic = Math.max(0, semantic - 15);
      reasons.push(`Field ${key} looks like placeholder: ${s}`);
    }
  }

  if (SUSPICIOUS_STRINGS.test(sample)) {
    semantic = Math.max(0, semantic - 20);
    reasons.push("Suspicious phrasing detected");
  }

  semantic = Math.max(0, Math.min(100, semantic));

  const schemaResult = runQualityEscrow({
    action: "settle",
    expectedProfile: input.expectedProfile,
    actualResponse: input.actualResponse,
    releaseThreshold: 0,
  });
  const schemaScore =
    typeof schemaResult === "object" && schemaResult && "qualityScore" in schemaResult
      ? Number((schemaResult as { qualityScore: number }).qualityScore)
      : 0;

  const combinedScore = Math.round(schemaScore * 0.45 + semantic * 0.55);
  return { semanticScore: semantic, schemaScore, combinedScore, reasons, judgeMode: judge.mode };
}

/**
 * Semantic Delivery Escrow — schema match + intent/rubric heuristics before release/refund.
 */
export async function runSemanticQualityEscrow(input: SemanticEscrowInput) {
  const threshold = input.releaseThreshold ?? 72;
  const escrowId = input.escrowId ?? `qsem_${Date.now().toString(36)}`;

  if (input.action === "hold") {
    return withAgentTrust(
        {
          action: "hold",
          escrowId,
          status: "held",
          mode: "semantic",
          payerAgentId: input.payerAgentId ?? null,
          payeeMerchant: input.payeeMerchant ?? null,
          amountUsdc: input.amountUsdc ?? null,
          deliveryIntent: input.deliveryIntent,
          releaseThreshold: threshold,
          note: "Call semantic-settle with actualResponse after downstream API returns.",
        },
      agentTrustMeta(["escrow_open", "semantic_mode"], { confidence: 0.9, sources: ["quality-escrow-semantic"] }),
    );
  }

  if (input.action === "refund") {
    return runQualityEscrow({
      action: "refund",
      escrowId,
      payerAgentId: input.payerAgentId,
      payeeMerchant: input.payeeMerchant,
      amountUsdc: input.amountUsdc,
    });
  }

  const { semanticScore, schemaScore, combinedScore, reasons, judgeMode } = await computeSemanticScores(input);
  const release = combinedScore >= threshold;

  const base = runQualityEscrow({
    action: "settle",
    escrowId,
    payerAgentId: input.payerAgentId,
    payeeMerchant: input.payeeMerchant,
    amountUsdc: input.amountUsdc,
    expectedProfile: input.expectedProfile,
    actualResponse: input.actualResponse,
    releaseThreshold: threshold,
  });

  const escrowStatus = release ? "released" : "refunded";
  const holdFeePct = input.amountUsdc ? Math.round(input.amountUsdc * 0.015 * 1000) / 1000 : null;

  let bondSlash: Awaited<ReturnType<typeof slashSellerBond>> | null = null;
  if (!release && input.payeeMerchant && input.amountUsdc) {
    const h = hostOf(input.payeeMerchant) || input.payeeMerchant.toLowerCase();
    const cert = await getCertifiedHost(h);
    if (cert?.bondRemainingUsdc && cert.bondRemainingUsdc > 0) {
      const slashAmt = Math.min(cert.bondRemainingUsdc, input.amountUsdc);
      bondSlash = await slashSellerBond(h, slashAmt, "semantic_delivery_fail");
    }
  }

  return withAgentTrust(
    {
      ...(typeof base === "object" && base ? base : {}),
      mode: "semantic",
      judgeMode,
      deliveryIntent: input.deliveryIntent,
      semanticScore,
      schemaScore,
      qualityScore: combinedScore,
      combinedScore,
      releaseThreshold: threshold,
      escrowStatus,
      decision: release ? "release-to-merchant" : "auto-refund-to-payer",
      allowed: release,
      summary: release
        ? `Semantic+schema score ${combinedScore} ≥ ${threshold} — release approved`
        : `Score ${combinedScore} < ${threshold} — auto-refund (semantic delivery failed)`,
      reasons,
      suggestedHoldFeeUsdc: holdFeePct,
      evidenceForDispute: !release
        ? {
            deliveryIntent: input.deliveryIntent,
            semanticScore,
            schemaScore,
            sample: input.actualResponse?.sample?.slice(0, 500) ?? null,
          }
        : null,
      bondSlash,
      nextStep: release
        ? null
        : {
            method: "POST",
            path: bondSlash?.ok ? "/api/trust-network/bond/slash" : "/api/dispute/resolve",
            note: "Escalate with evidenceForDispute or bond slash record",
          },
    },
    agentTrustMeta(
      release ? ["semantic_pass", "schema_pass"] : ["semantic_fail", "auto_refund"],
      {
        confidence: 0.84,
        sources: ["quality-escrow-semantic", "good-response-profile"],
        accuracy_note:
          "Semantic rubric is heuristic (no external LLM). Supply fields/sample for best accuracy; upgrade path: LLM judge hook.",
      },
    ),
  );
}
