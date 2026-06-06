import { hmacSign } from "../protocol/crypto.js";
import { getCertifiedHost } from "../lib/certified-sellers.js";
import { randomBytes } from "node:crypto";
import { withAgentTrust, agentTrustMeta } from "../lib/agent-response.js";

export type InsuranceInput = {
  buyerWallet: string;
  sellerHost: string;
  amountUsdc: number;
  agentId?: string;
};

export type InsuranceResult = {
  status: "ok" | "error";
  insured: boolean;
  insuranceAttestationId: string;
  coverageLimitUsdc: number;
  coveredAmountUsdc: number;
  riskRating: "LOW" | "MEDIUM" | "HIGH";
  bondedCollateralUsdc: number;
  summary: string;
  signature: string;
  issuedAt: string;
};

export async function runInsuranceAttest(input: InsuranceInput) {
  const host = input.sellerHost.toLowerCase();
  const cert = await getCertifiedHost(host);
  const now = new Date().toISOString();

  let insured = false;
  let riskRating: "LOW" | "MEDIUM" | "HIGH" = "HIGH";
  let bondedCollateralUsdc = 0;
  let coverageLimitUsdc = 0;
  let coveredAmountUsdc = 0;

  if (cert) {
    bondedCollateralUsdc = cert.bondRemainingUsdc ?? cert.bondUsdc ?? 0;
    if (bondedCollateralUsdc > 0) {
      insured = true;
      riskRating = cert.grade === "A" || cert.grade === "B" ? "LOW" : "MEDIUM";
      // Cover up to 80% of transaction amount or the remaining bond limit
      coverageLimitUsdc = Math.max(10, bondedCollateralUsdc);
      coveredAmountUsdc = Math.min(input.amountUsdc * 0.8, coverageLimitUsdc);
    }
  }

  const insuranceAttestationId = `ins_${randomBytes(8).toString("hex")}`;
  const summary = insured
    ? `Transaction insured successfully. Covered amount: ${coveredAmountUsdc.toFixed(2)} USDC (80% of transaction, backed by ${bondedCollateralUsdc} USDC merchant bond). Risk grade: ${riskRating}.`
    : `Transaction denied insurance. Merchant ${host} has no active virtual bond locked in the trust network. Risk rating: HIGH.`;

  const payloadString = JSON.stringify({
    insuranceAttestationId,
    buyerWallet: input.buyerWallet,
    sellerHost: host,
    amountUsdc: input.amountUsdc,
    coveredAmountUsdc,
    insured,
    issuedAt: now
  });
  const signature = hmacSign(payloadString);

  const result: InsuranceResult = {
    status: "ok",
    insured,
    insuranceAttestationId,
    coverageLimitUsdc,
    coveredAmountUsdc,
    riskRating,
    bondedCollateralUsdc,
    summary,
    signature,
    issuedAt: now
  };

  return withAgentTrust(
    result,
    agentTrustMeta(insured ? ["transaction_insured"] : ["insurance_denied"], {
      confidence: insured ? 0.92 : 0.4,
      sources: ["trust-network", "insurance-oracle"]
    })
  );
}
