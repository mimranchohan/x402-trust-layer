import { hostOf } from "./probe.js";

const BLOCKED_HOST_PATTERNS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "metadata.google",
  "169.254.",
  "10.",
  "192.168.",
];

const HIGH_RISK_TLDS = [".tk", ".ml", ".ga", ".cf", ".gq"];

export type SecurityGrade = "A" | "B" | "C" | "D" | "F";

export type SecurityAssessment = {
  grade: SecurityGrade;
  score: number;
  threats: string[];
  recommendations: string[];
};

export function assessUrlSecurity(url: string): SecurityAssessment {
  const threats: string[] = [];
  const recommendations: string[] = [];
  let score = 85;

  const host = hostOf(url);
  if (!host) {
    return { grade: "F", score: 0, threats: ["Invalid URL"], recommendations: ["Use HTTPS public endpoints only"] };
  }

  if (!url.startsWith("https://")) {
    score -= 25;
    threats.push("Non-HTTPS target URL");
    recommendations.push("Prefer https:// endpoints for x402 settlement");
  }

  for (const p of BLOCKED_HOST_PATTERNS) {
    if (host.includes(p)) {
      score -= 50;
      threats.push(`Blocked host pattern: ${p}`);
    }
  }

  for (const tld of HIGH_RISK_TLDS) {
    if (host.endsWith(tld)) {
      score -= 15;
      threats.push(`High-risk TLD: ${tld}`);
    }
  }

  if (host.length > 80) {
    score -= 10;
    threats.push("Unusually long hostname");
  }

  const grade: SecurityGrade =
    score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

  if (grade !== "A") {
    recommendations.push("Run POST /api/guard/pre-x402 before paying this URL");
    recommendations.push("Request attestation via POST /api/attestation/issue after settlement");
  }

  return { grade, score: Math.max(0, Math.min(100, score)), threats, recommendations };
}

export function mergeSecurityIntoRisk(
  baseScore: number,
  urlAssessment: SecurityAssessment,
): { riskScore: number; securityGrade: SecurityGrade; combinedThreats: string[] } {
  const combinedThreats = [...urlAssessment.threats];
  const riskScore = Math.min(100, Math.round((baseScore + (100 - urlAssessment.score)) / 2));
  return { riskScore, securityGrade: urlAssessment.grade, combinedThreats };
}
