import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";
import { config } from "../config.js";

export type DisputeReason =
  | "non_delivery"
  | "quality_mismatch"
  | "overcharge"
  | "duplicate"
  | "unauthorized";

export type DisputeRail = "visa-cli" | "card" | "base-x402" | "solana-x402" | "circle-nano" | "stripe-mpp";

export type DisputeEvidence = {
  expectedSchema?: string[];
  actualResponseEmpty?: boolean;
  verificationScore?: number;
  receiptValid?: boolean;
  duplicateOfTx?: string;
  chargedUsdc?: number;
  quotedUsdc?: number;
};

export type DisputeResolveInput = {
  rail: DisputeRail;
  merchant: string;
  amountUsdc: number;
  reason: DisputeReason;
  transactionHash?: string;
  evidence?: DisputeEvidence;
};

// Visa-style reason code families (illustrative mapping for card rails).
const VISA_REASON_CODE: Record<DisputeReason, { code: string; family: string }> = {
  non_delivery: { code: "13.1", family: "Merchandise/Services Not Received" },
  quality_mismatch: { code: "13.3", family: "Not as Described or Defective" },
  overcharge: { code: "12.5", family: "Incorrect Amount" },
  duplicate: { code: "12.6", family: "Duplicate Processing" },
  unauthorized: { code: "10.4", family: "Fraud — Card Absent Environment" },
};

function isCardRail(rail: DisputeRail): boolean {
  return rail === "visa-cli" || rail === "card";
}

/**
 * Dispute & Chargeback Auto-Resolver.
 * Visa CLI brings chargeback rights to agentic payments — but nobody automates
 * the filing. For card rails this builds a Visa chargeback dossier (reason code,
 * required evidence, filing steps). For final/stablecoin rails (no chargeback)
 * it routes to an escrow/refund claim instead. Bridges card dispute rules with
 * on-chain receipts.
 */
export function runDisputeResolve(input: DisputeResolveInput) {
  const ev = input.evidence ?? {};
  const card = isCardRail(input.rail);

  // Strength of the dispute (0-100) from evidence.
  let strength = 40;
  const evidenceItems: string[] = [];
  const requiredEvidence: string[] = [];

  if (input.reason === "non_delivery") {
    if (ev.actualResponseEmpty) { strength += 35; evidenceItems.push("Empty/absent response captured"); }
    if (ev.receiptValid === false) { strength += 10; evidenceItems.push("Settlement receipt could not be validated"); }
    requiredEvidence.push("Timestamped request/response logs", "Proof endpoint returned no deliverable");
  }
  if (input.reason === "quality_mismatch") {
    if (typeof ev.verificationScore === "number" && ev.verificationScore < 50) { strength += 30; evidenceItems.push(`Verification score ${ev.verificationScore} below threshold`); }
    if (ev.expectedSchema?.length) { strength += 10; evidenceItems.push(`Expected schema keys: ${ev.expectedSchema.join(", ")}`); }
    requiredEvidence.push("Published 'good response' profile vs actual response diff");
  }
  if (input.reason === "overcharge") {
    if (ev.chargedUsdc != null && ev.quotedUsdc != null && ev.chargedUsdc > ev.quotedUsdc) {
      strength += 40;
      evidenceItems.push(`Charged $${ev.chargedUsdc} vs quoted $${ev.quotedUsdc}`);
    }
    requiredEvidence.push("Original 402 quote", "Settlement amount proof");
  }
  if (input.reason === "duplicate") {
    if (ev.duplicateOfTx) { strength += 45; evidenceItems.push(`Duplicate of tx ${ev.duplicateOfTx}`); }
    requiredEvidence.push("Both transaction hashes with identical merchant + amount");
  }
  if (input.reason === "unauthorized") {
    strength += 20;
    requiredEvidence.push("Mandate showing payment outside signed scope", "Agent identity attestation");
  }

  strength = Math.max(0, Math.min(100, strength));
  const likelihood = strength >= 70 ? "strong" : strength >= 45 ? "moderate" : "weak";

  if (card) {
    const rc = VISA_REASON_CODE[input.reason];
    return withAgentTrust(
      {
        path: "card-chargeback",
        rail: input.rail,
        merchant: input.merchant,
        amountUsdc: input.amountUsdc,
        reason: input.reason,
        reasonCode: rc.code,
        reasonFamily: rc.family,
        disputeStrength: strength,
        likelihood,
        autoFileable: strength >= 70,
        requiredEvidence,
        evidenceCaptured: evidenceItems,
        filingSteps: [
          "Compile evidence bundle (logs + receipt + mandate)",
          `File chargeback under Visa reason code ${rc.code} (${rc.family})`,
          "Submit via Visa CLI dispute channel / issuing bank",
          "Track representment window and respond to merchant compelling evidence",
        ],
        nextStep: { method: "POST", path: "/api/compliance/ledger", note: "Log disputed item in audit ledger" },
      },
      agentTrustMeta(["reason_code_map", "evidence_scoring"], {
        confidence: 0.83,
        sources: ["dispute-resolver", "visa-dispute-rules"],
        accuracy_note: "Reason codes are illustrative; confirm current Visa Dispute Resolution code set before filing.",
      }),
    );
  }

  // Stablecoin / final rails: no chargeback — route to escrow/refund claim.
  return withAgentTrust(
    {
      path: "onchain-refund-claim",
      rail: input.rail,
      merchant: input.merchant,
      amountUsdc: input.amountUsdc,
      reason: input.reason,
      finality: "final (no card chargeback available)",
      disputeStrength: strength,
      likelihood,
      autoFileable: false,
      requiredEvidence,
      evidenceCaptured: evidenceItems,
      recommendedRoute: [
        "Open/settle via /api/agent-escrow so funds are release-gated next time",
        "Score eligibility via /api/refund-arbiter/evaluate",
        "Request merchant refund with receipt proof from /api/receipt-auditor/verify",
      ],
      escrowUrl: `${config.publicBaseUrl}/api/agent-escrow`,
      refundArbiterUrl: `${config.publicBaseUrl}/api/refund-arbiter/evaluate`,
    },
    agentTrustMeta(["finality_check", "evidence_scoring"], {
      confidence: 0.78,
      sources: ["dispute-resolver", "x402-settlement"],
      accuracy_note:
        "Stablecoin settlements are irreversible; future spend should be escrow-gated. Use card rails (Visa CLI) when dispute rights matter.",
    }),
  );
}
