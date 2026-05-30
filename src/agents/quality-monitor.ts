import { probeEndpoint } from "../lib/probe.js";

export type QualityTarget = {
  url: string;
  expectedStatus?: number;
};

export type QualityMonitorInput = {
  targets: QualityTarget[];
};

export type QualityEntry = {
  url: string;
  status: number;
  expectedStatus: number | null;
  matchesExpectation: boolean;
  classification: "ok" | "expected_failure" | "unexpected_failure";
  requiresPayment: boolean;
  priceUsdc: number | null;
  healthy: boolean;
  score: number;
  notes: string[];
};

export type QualityMonitorResult = {
  status: "ok";
  success: boolean;
  healthy: boolean;
  checkedAt: string;
  results: QualityEntry[];
  averageScore: number;
  overall: "pass" | "inconclusive" | "fail";
  summary: string;
};

export async function runQualityMonitor(input: QualityMonitorInput): Promise<QualityMonitorResult> {
  const results: QualityEntry[] = [];

  for (const t of input.targets.slice(0, 10)) {
    const probe = await probeEndpoint(t.url);
    const notes: string[] = [];
    let score = 50;
    const expected = typeof t.expectedStatus === "number" ? t.expectedStatus : null;
    // If caller does not provide an expected status, treat any reachable HTTP response
    // as a successful probe execution (this endpoint audits observability, not contract tests).
    const matchesExpectation = expected == null ? probe.status > 0 : probe.status === expected;

    if (probe.status === 402) {
      score += 25;
      notes.push("Correctly returns HTTP 402 for unpaid requests");
    } else if (probe.status === 200) {
      score += 10;
      notes.push("Returns 200 without payment — verify this is intentional");
    } else if (probe.status === 0) {
      score -= 40;
      notes.push("Unreachable");
    } else if (probe.status >= 400) {
      score -= 10;
      notes.push(`HTTP ${probe.status} from target`);
    }

    if (matchesExpectation) score += 10;
    if (!matchesExpectation && expected != null) notes.push(`Expected HTTP ${expected}, got ${probe.status}`);
    if (probe.priceUsdc != null && probe.priceUsdc <= 0.25) score += 10;
    if (probe.warnings.length) notes.push(...probe.warnings);

    const classification: QualityEntry["classification"] = matchesExpectation
      ? expected != null && expected >= 400
        ? "expected_failure"
        : "ok"
      : "unexpected_failure";
    results.push({
      url: t.url,
      status: probe.status,
      expectedStatus: expected,
      matchesExpectation,
      classification,
      requiresPayment: probe.requiresPayment,
      priceUsdc: probe.priceUsdc,
      healthy: matchesExpectation,
      score: Math.max(0, Math.min(100, score)),
      notes,
    });
  }

  const averageScore =
    results.length > 0 ? results.reduce((s, r) => s + r.score, 0) / results.length : 0;
  const healthyCount = results.filter((r) => r.healthy).length;
  const unexpectedFailures = results.filter((r) => r.classification === "unexpected_failure").length;
  const overall: QualityMonitorResult["overall"] =
    unexpectedFailures === 0 && results.length > 0
      ? "pass"
      : healthyCount > 0
        ? "inconclusive"
        : "fail";

  return {
    status: "ok",
    success: unexpectedFailures === 0,
    healthy: unexpectedFailures === 0,
    checkedAt: new Date().toISOString(),
    results,
    averageScore: Number(averageScore.toFixed(1)),
    overall,
    summary:
      unexpectedFailures === 0
        ? `${healthyCount}/${results.length} targets met expected status`
        : `${unexpectedFailures} targets deviated from expected status; ${healthyCount}/${results.length} met expectation`,
  };
}
