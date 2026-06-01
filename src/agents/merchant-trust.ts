import { hostOf, probeEndpoint } from "../lib/probe.js";
import { assessUrlSecurity } from "../lib/security.js";
import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";
import { fetchHostTelemetry } from "../lib/ecosystem-telemetry.js";

export type MerchantTrustInput = {
  host: string;
  targetUrl?: string;
  observedTxns?: number;
  observedVolumeUsdc?: number;
  washTradePct?: number;
  verifiedResources?: number;
  totalResources?: number;
  avgTxUsdc?: number;
  p50LatencyMs?: number;
  probe?: boolean;
  /** Pull wash/volume hints from x402watch when fields omitted (default true) */
  autoIngest?: boolean;
};

export type MerchantTrustResult = WithAgentTrust<{
  host: string;
  trustScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  recommendation: "pay" | "caution" | "avoid";
  washTradeRisk: "low" | "medium" | "high";
  verifiedRatio: number | null;
  signals: string[];
  penalties: { reason: string; points: number }[];
  liveProbe: Awaited<ReturnType<typeof probeEndpoint>> | null;
}>;

function gradeFor(score: number): MerchantTrustResult["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Know-Your-Merchant (KYM) pre-payment trust oracle.
 * Scores an x402 merchant host from authenticity signals before an agent pays:
 * wash-trading rate, verification ratio, volume realism, latency, and an
 * optional live x402 probe. No equivalent exists across the public ecosystem
 * (x402gle surfaces raw wash %, but does not synthesize a pay/avoid decision).
 */
export async function runMerchantTrust(input: MerchantTrustInput): Promise<MerchantTrustResult> {
  let enriched = { ...input };
  const hostPre = (input.host || hostOf(input.targetUrl ?? "") || "").toLowerCase();
  if (input.autoIngest !== false && hostPre) {
    const telemetry = await fetchHostTelemetry(hostPre, input.targetUrl);
    if (telemetry?.washTradePct != null || telemetry?.observedTxns != null) {
      enriched = {
        ...enriched,
        washTradePct: enriched.washTradePct ?? telemetry.washTradePct,
        observedTxns: enriched.observedTxns ?? telemetry.observedTxns,
        observedVolumeUsdc: enriched.observedVolumeUsdc ?? telemetry.observedVolumeUsdc,
        verifiedResources: enriched.verifiedResources ?? telemetry.verifiedResources,
        totalResources: enriched.totalResources ?? telemetry.totalResources,
      };
    }
  }

  const host = (enriched.host || hostOf(enriched.targetUrl ?? "") || "").toLowerCase();
  const signals: string[] = [];
  const penalties: { reason: string; points: number }[] = [];
  let score = 80;

  if (!host) {
    return withAgentTrust(
      {
        host: "",
        trustScore: 0,
        grade: "F" as const,
        recommendation: "avoid" as const,
        washTradeRisk: "high" as const,
        verifiedRatio: null,
        signals: ["No host or targetUrl supplied"],
        penalties: [{ reason: "missing_host", points: 80 }],
        liveProbe: null,
      },
      agentTrustMeta(["input_validation"], { confidence: 0.4, sources: ["merchant-trust-oracle"] }),
    );
  }

  // Wash-trading penalty (x402gle reports ~17% baseline; treat >25% as serious).
  const wash = typeof enriched.washTradePct === "number" ? enriched.washTradePct : null;
  let washTradeRisk: MerchantTrustResult["washTradeRisk"] = "low";
  if (wash != null) {
    if (wash >= 40) {
      penalties.push({ reason: `Wash-trade rate ${wash}% is high`, points: 35 });
      score -= 35;
      washTradeRisk = "high";
    } else if (wash >= 20) {
      penalties.push({ reason: `Wash-trade rate ${wash}% above ecosystem norm`, points: 15 });
      score -= 15;
      washTradeRisk = "medium";
    } else {
      signals.push(`Wash-trade rate ${wash}% within healthy band`);
    }
  } else {
    signals.push("No wash-trade telemetry supplied — using neutral prior");
  }

  // Verification ratio (verified resources / total resources).
  let verifiedRatio: number | null = null;
  if (
    typeof enriched.verifiedResources === "number" &&
    typeof enriched.totalResources === "number" &&
    enriched.totalResources > 0
  ) {
    verifiedRatio = enriched.verifiedResources / enriched.totalResources;
    if (verifiedRatio >= 0.5) {
      score += 8;
      signals.push(`${Math.round(verifiedRatio * 100)}% of resources verified`);
    } else if (verifiedRatio < 0.05) {
      penalties.push({ reason: `Only ${Math.round(verifiedRatio * 100)}% resources verified`, points: 18 });
      score -= 18;
    } else {
      penalties.push({ reason: `Low verification ratio ${Math.round(verifiedRatio * 100)}%`, points: 8 });
      score -= 8;
    }
  }

  // Volume realism: extremely high txns with near-zero volume signals spam/wash.
  if (typeof enriched.observedTxns === "number" && typeof enriched.observedVolumeUsdc === "number") {
    const perTx = enriched.observedTxns > 0 ? enriched.observedVolumeUsdc / enriched.observedTxns : 0;
    if (enriched.observedTxns > 50_000 && perTx < 0.011) {
      penalties.push({ reason: "Very high txn count with sub-cent average — spam/wash pattern", points: 20 });
      score -= 20;
      if (washTradeRisk === "low") washTradeRisk = "medium";
    } else if (perTx > 0) {
      signals.push(`Average settlement ~$${perTx.toFixed(4)} per txn`);
    }
  }

  // Latency band (p50).
  if (typeof enriched.p50LatencyMs === "number") {
    if (enriched.p50LatencyMs > 4000) {
      penalties.push({ reason: `Slow p50 latency ${enriched.p50LatencyMs}ms`, points: 10 });
      score -= 10;
    } else if (enriched.p50LatencyMs <= 1500) {
      score += 4;
      signals.push(`Fast p50 latency ${enriched.p50LatencyMs}ms`);
    }
  }

  // Optional live probe.
  let liveProbe: Awaited<ReturnType<typeof probeEndpoint>> | null = null;
  if (enriched.probe && enriched.targetUrl) {
    try {
      liveProbe = await probeEndpoint(enriched.targetUrl);
      if (liveProbe.status === 0) {
        penalties.push({ reason: "Live endpoint unreachable", points: 25 });
        score -= 25;
      } else if (liveProbe.requiresPayment) {
        signals.push("Live endpoint returns a valid 402 payment challenge");
        score += 5;
      } else if (liveProbe.status === 200) {
        penalties.push({ reason: "Endpoint is open (not x402-protected) — unexpected for paid host", points: 6 });
        score -= 6;
      }
      const sec = assessUrlSecurity(enriched.targetUrl);
      if (sec.grade === "F") {
        penalties.push({ reason: "URL security grade F", points: 20 });
        score -= 20;
      }
    } catch (err) {
      signals.push(`Live probe skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeFor(score);
  const recommendation: MerchantTrustResult["recommendation"] =
    score >= 70 ? "pay" : score >= 45 ? "caution" : "avoid";

  return withAgentTrust(
    {
      host,
      trustScore: score,
      grade,
      recommendation,
      washTradeRisk,
      verifiedRatio,
      signals,
      penalties,
      liveProbe,
    },
    agentTrustMeta(
      [
        "wash_trade_check",
        "verification_ratio",
        "volume_realism",
        enriched.probe ? "live_probe" : "telemetry_only",
        input.autoIngest !== false ? "x402watch_ingest" : "manual_telemetry",
      ],
      {
        confidence: enriched.probe ? 0.85 : 0.7,
        sources: ["merchant-trust-oracle", "x402gle-signals"],
        accuracy_note:
          "KYM trust is a pre-payment heuristic from supplied telemetry and optional live probe; not a guarantee of settlement quality.",
      },
    ),
  );
}
