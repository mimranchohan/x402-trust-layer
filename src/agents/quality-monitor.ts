import { probeEndpoint } from "../lib/probe.js";

export type QualityMonitorInput = {
  urls: string[];
};

export type QualityEntry = {
  url: string;
  status: number;
  requiresPayment: boolean;
  priceUsdc: number | null;
  healthy: boolean;
  score: number;
  notes: string[];
};

export type QualityMonitorResult = {
  checkedAt: string;
  results: QualityEntry[];
  averageScore: number;
};

export async function runQualityMonitor(input: QualityMonitorInput): Promise<QualityMonitorResult> {
  const results: QualityEntry[] = [];

  for (const url of input.urls.slice(0, 10)) {
    const probe = await probeEndpoint(url);
    const notes: string[] = [];
    let score = 50;

    if (probe.status === 402) {
      score += 25;
      notes.push("Correctly returns HTTP 402 for unpaid requests");
    } else if (probe.status === 200) {
      score += 10;
      notes.push("Returns 200 without payment — verify this is intentional");
    } else if (probe.status === 0) {
      score -= 40;
      notes.push("Unreachable");
    }

    if (probe.priceUsdc != null && probe.priceUsdc <= 0.25) score += 10;
    if (probe.warnings.length) notes.push(...probe.warnings);

    results.push({
      url,
      status: probe.status,
      requiresPayment: probe.requiresPayment,
      priceUsdc: probe.priceUsdc,
      healthy: probe.status === 402 || probe.status === 200,
      score: Math.max(0, Math.min(100, score)),
      notes,
    });
  }

  const averageScore =
    results.length > 0 ? results.reduce((s, r) => s + r.score, 0) / results.length : 0;

  return {
    checkedAt: new Date().toISOString(),
    results,
    averageScore: Number(averageScore.toFixed(1)),
  };
}
