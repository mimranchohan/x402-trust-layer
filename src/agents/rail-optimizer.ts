import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";

export type RailId = "visa-cli" | "stripe-mpp" | "circle-nano" | "base-x402" | "solana-x402";

export type RailOptimizerInput = {
  amountUsdc: number;
  disputable?: boolean;
  latencySensitive?: boolean;
  expectedCalls?: number;
  merchantRailsSupported?: RailId[];
  preferProtection?: boolean;
};

type RailProfile = {
  rail: RailId;
  label: string;
  settlement: "card-network" | "stablecoin" | "session";
  chargeback: boolean;
  finality: "reversible" | "final";
  minViableUsdc: number;
  feeUsdc: (amt: number, calls: number) => number;
  notes: string;
};

const RAILS: RailProfile[] = [
  {
    rail: "visa-cli",
    label: "Visa CLI (card rails)",
    settlement: "card-network",
    chargeback: true,
    finality: "reversible",
    minViableUsdc: 0.5,
    feeUsdc: (amt) => Math.max(0.05, amt * 0.029 + 0.05),
    notes: "Certified agent + merchant identity, chargeback/dispute rights, biometric guardrails.",
  },
  {
    rail: "stripe-mpp",
    label: "Stripe MPP (Tempo sessions)",
    settlement: "session",
    chargeback: false,
    finality: "final",
    minViableUsdc: 0.001,
    feeUsdc: (amt, calls) => Math.max(0.0008, (amt * 0.012) / Math.max(1, Math.min(calls, 50))),
    notes: "Open/settle session amortizes fees across many high-frequency calls.",
  },
  {
    rail: "circle-nano",
    label: "Circle Nanopayments (USDC)",
    settlement: "stablecoin",
    chargeback: false,
    finality: "final",
    minViableUsdc: 0.000001,
    feeUsdc: (amt) => amt * 0.002,
    notes: "Best for sub-cent micropayments where card economics fail.",
  },
  {
    rail: "base-x402",
    label: "Base x402 (EIP-3009 USDC)",
    settlement: "stablecoin",
    chargeback: false,
    finality: "final",
    minViableUsdc: 0.0001,
    feeUsdc: (amt) => amt * 0.004 + 0.0005,
    notes: "Default reference rail; gasless USDC, broad facilitator support.",
  },
  {
    rail: "solana-x402",
    label: "Solana x402 (SPL USDC)",
    settlement: "stablecoin",
    chargeback: false,
    finality: "final",
    minViableUsdc: 0.0001,
    feeUsdc: (amt) => amt * 0.003 + 0.0003,
    notes: "Sub-second finality, very low fees; facilitator-paid network fees.",
  },
];

/**
 * Cross-Rail Payment Optimizer.
 * Picks the best settlement rail per transaction across Visa CLI, Stripe MPP,
 * Circle Nanopayments, Base x402, and Solana x402 — balancing cost, finality,
 * and chargeback protection. Nothing in the public ecosystem unifies card rails
 * with stablecoin x402 rails in one decision.
 */
export function runRailOptimizer(input: RailOptimizerInput) {
  const amt = input.amountUsdc;
  const calls = input.expectedCalls ?? 1;
  const supported = input.merchantRailsSupported && input.merchantRailsSupported.length > 0
    ? new Set(input.merchantRailsSupported)
    : null;

  const candidates = RAILS.filter((r) => (supported ? supported.has(r.rail) : true)).map((r) => {
    const viable = amt >= r.minViableUsdc;
    const fee = r.feeUsdc(amt, calls);
    let protectionScore = r.chargeback ? 90 : 40;
    if (r.settlement === "session") protectionScore = 55;
    // Cost score: lower fee ratio is better.
    const feeRatio = amt > 0 ? fee / amt : 1;
    const costScore = Math.max(0, 100 - feeRatio * 400);

    let fitScore = costScore * 0.5 + protectionScore * 0.3;
    const reasons: string[] = [];

    if (input.disputable && amt >= 1 && r.chargeback) {
      fitScore += 25;
      reasons.push("Disputable $1+ purchase → chargeback protection preferred");
    }
    if (amt < 0.01 && r.rail === "circle-nano") {
      fitScore += 30;
      reasons.push("Sub-cent amount → nanopayment rail ideal");
    }
    if (amt < 0.01 && r.rail === "visa-cli") {
      fitScore -= 40;
      reasons.push("Card economics fail below $0.01");
    }
    if (input.latencySensitive && r.rail === "solana-x402") {
      fitScore += 12;
      reasons.push("Latency-sensitive → Solana sub-second finality");
    }
    if (calls >= 20 && r.settlement === "session") {
      fitScore += 18;
      reasons.push("High call volume → MPP session amortization");
    }
    if (input.preferProtection && r.chargeback) {
      fitScore += 15;
      reasons.push("Caller prefers reversibility");
    }
    if (!viable) {
      fitScore -= 60;
      reasons.push(`Amount below minimum viable ($${r.minViableUsdc})`);
    }

    return {
      rail: r.rail,
      label: r.label,
      viable,
      estimatedFeeUsdc: Number(fee.toFixed(6)),
      chargeback: r.chargeback,
      finality: r.finality,
      protectionScore,
      fitScore: Math.round(Math.max(0, Math.min(150, fitScore))),
      notes: r.notes,
      reasons,
    };
  });

  candidates.sort((a, b) => b.fitScore - a.fitScore);
  const best = candidates[0] ?? null;

  return withAgentTrust(
    {
      amountUsdc: amt,
      recommendedRail: best?.rail ?? null,
      recommendation: best
        ? `Route via ${best.label} (fit ${best.fitScore}, est. fee $${best.estimatedFeeUsdc})`
        : "No viable rail",
      ranked: candidates,
    },
    agentTrustMeta(["rail_cost_model", "protection_model", "viability_check"], {
      confidence: 0.84,
      sources: ["rail-optimizer", "visa-cli", "stripe-mpp", "circle", "x402-foundation"],
      accuracy_note:
        "Fee figures are model estimates; confirm live facilitator/card pricing before settlement.",
    }),
  );
}
