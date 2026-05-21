import { hostOf, probeEndpoint } from "../lib/probe.js";
import { assessUrlSecurity, mergeSecurityIntoRisk } from "../lib/security.js";
import type { RiskGateInput } from "../types.js";

export type RiskGateResult = {
  safe: boolean;
  riskScore: number;
  securityGrade: string;
  reasons: string[];
  probe: Awaited<ReturnType<typeof probeEndpoint>>;
  securityRecommendations: string[];
};

export async function runRiskGate(input: RiskGateInput): Promise<RiskGateResult> {
  const reasons: string[] = [];
  let riskScore = 0;

  const host = hostOf(input.targetUrl);
  if (!host) {
    return {
      safe: false,
      riskScore: 100,
      securityGrade: "F",
      reasons: ["Invalid URL"],
      probe: await probeEndpoint(input.targetUrl),
      securityRecommendations: ["Use HTTPS public endpoints only"],
    };
  }

  if (input.policy?.blockedHosts?.some((h) => host.includes(h.toLowerCase()))) {
    reasons.push(`Blocked host: ${host}`);
    riskScore += 80;
  }

  const probe = await probeEndpoint(input.targetUrl);

  if (probe.status === 0) {
    reasons.push("Endpoint unreachable");
    riskScore += 50;
  }

  if (!probe.requiresPayment && probe.status === 200) {
    reasons.push("Endpoint is not x402-protected (unexpected for paid agent flows)");
    riskScore += 15;
  }

  if (probe.priceUsdc != null && input.policy?.perCallCapUsdc != null) {
    if (probe.priceUsdc > input.policy.perCallCapUsdc) {
      reasons.push(`Price $${probe.priceUsdc} exceeds cap $${input.policy.perCallCapUsdc}`);
      riskScore += 40;
    }
  }

  if (input.estimatedCostUsdc != null && probe.priceUsdc != null) {
    if (input.estimatedCostUsdc < probe.priceUsdc * 0.5) {
      reasons.push("Estimated cost suspiciously lower than probed price");
      riskScore += 20;
    }
  }

  const urlSec = assessUrlSecurity(input.targetUrl);
  const merged = mergeSecurityIntoRisk(riskScore, urlSec);
  const allReasons = [...reasons, ...merged.combinedThreats];
  const safe = merged.riskScore < 50 && allReasons.length === 0;

  return {
    safe,
    riskScore: merged.riskScore,
    securityGrade: merged.securityGrade,
    reasons: allReasons,
    probe,
    securityRecommendations: urlSec.recommendations,
  };
}
