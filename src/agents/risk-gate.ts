import {
  isExpectedAgenticGatewayProbeStatus,
  isKnownAgenticGateway,
} from "../lib/agentic-gateways.js";
import { hostOf, probeEndpoint } from "../lib/probe.js";
import { assertSafeOutboundUrl, UnsafeUrlError } from "../lib/ssrf.js";
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
  const probeOpts = { fastSynthetic: input.fastProbe === true };
  const reasons: string[] = [];
  let riskScore = 0;

  const host = hostOf(input.targetUrl);
  if (!host) {
    return {
      safe: false,
      riskScore: 100,
      securityGrade: "F",
      reasons: ["Invalid URL"],
      probe: await probeEndpoint(input.targetUrl, probeOpts),
      securityRecommendations: ["Use HTTPS public endpoints only"],
    };
  }

  try {
    assertSafeOutboundUrl(input.targetUrl);
  } catch (err) {
    const msg = err instanceof UnsafeUrlError ? err.message : "URL blocked";
    return {
      safe: false,
      riskScore: 100,
      securityGrade: "F",
      reasons: [msg],
      probe: await probeEndpoint(input.targetUrl, probeOpts),
      securityRecommendations: ["Use public HTTPS endpoints only"],
    };
  }

  if (input.policy?.blockedHosts?.some((h) => host.includes(h.toLowerCase()))) {
    reasons.push(`Blocked host: ${host}`);
    riskScore += 80;
  }

  const probe = await probeEndpoint(input.targetUrl, probeOpts);
  const knownGateway = host != null && isKnownAgenticGateway(host);

  if (probe.status === 0) {
    reasons.push("Endpoint unreachable");
    riskScore += 50;
  } else if (knownGateway && isExpectedAgenticGatewayProbeStatus(probe.status)) {
    // SIWE-first agentic gateways (e.g. x402.alchemy.com) return 401/403 before 402.
  } else if (knownGateway && probe.status >= 500) {
    // Gateway may error on unauthenticated probes; allowlist + policy still govern spend.
  } else if (!probe.requiresPayment && probe.status === 200) {
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
