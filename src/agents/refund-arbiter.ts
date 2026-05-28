export type RefundArbiterInput = {
  verificationScore?: number;
  responseEmpty?: boolean;
  responseGeneric?: boolean;
  expectedAmountUsdc?: number;
  actualAmountUsdc?: number;
  endpointReachable?: boolean;
};

export type RefundArbiterResult = {
  status: "ok";
  summary: string;
  refundEligible: boolean;
  protectionTier: "full" | "partial" | "none";
  grade: string;
  reasons: string[];
  buyerGuidance: string;
  inputsUsed: {
    verificationScore: number;
    responseEmpty: boolean;
    responseGeneric: boolean;
    endpointReachable: boolean;
  };
};

function gradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function runRefundArbiter(input: RefundArbiterInput): RefundArbiterResult {
  const score = input.verificationScore ?? 50;
  const reasons: string[] = [];
  let refundEligible = false;

  if (input.endpointReachable === false) {
    reasons.push("Endpoint was unreachable during verification");
    refundEligible = true;
  }
  if (input.responseEmpty) {
    reasons.push("Response was empty or error-only");
    refundEligible = true;
  }
  if (input.responseGeneric) {
    reasons.push("Response was generic and not actionable");
    refundEligible = score < 70;
  }
  if (
    input.expectedAmountUsdc != null &&
    input.actualAmountUsdc != null &&
    Math.abs(input.expectedAmountUsdc - input.actualAmountUsdc) > 0.0001
  ) {
    reasons.push("Paid amount does not match quoted requirements");
    refundEligible = true;
  }

  let protectionTier: RefundArbiterResult["protectionTier"] = "none";
  if (score >= 70) protectionTier = "full";
  else if (score >= 50) protectionTier = "partial";

  if (!refundEligible && score < 50) {
    refundEligible = true;
    reasons.push("Verification score below minimum marketplace threshold");
  }

  return {
    status: "ok",
    summary: "Refund decision computed from verification signals.",
    refundEligible,
    protectionTier,
    grade: gradeFromScore(score),
    reasons,
    buyerGuidance:
      refundEligible && protectionTier !== "none"
        ? "Buyer may qualify for a refund claim through Dexter refund protection. Attach settlement receipt and verification notes."
        : "Refund not recommended. Seller meets minimum quality threshold.",
    inputsUsed: {
      verificationScore: score,
      responseEmpty: Boolean(input.responseEmpty),
      responseGeneric: Boolean(input.responseGeneric),
      endpointReachable: input.endpointReachable !== false,
    },
  };
}
