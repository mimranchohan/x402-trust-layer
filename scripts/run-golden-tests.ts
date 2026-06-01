/**
 * Golden tests for semantic judge + semantic escrow scoring (no network, no OPENAI).
 * Usage: npx tsx scripts/run-golden-tests.ts
 */
import { heuristicJudge } from "../src/lib/semantic-judge.js";
import { runSemanticQualityEscrow } from "../src/agents/quality-escrow-semantic.js";

type Case = {
  name: string;
  input: Parameters<typeof heuristicJudge>[0];
  minScore: number;
  maxScore: number;
};

const judgeCases: Case[] = [
  {
    name: "valid ETH price response",
    input: {
      deliveryIntent: "ETH/USD spot oracle price with symbol",
      sample: '{"price":3450.12,"symbol":"ETH"}',
      fields: { price: 3450.12, symbol: "ETH" },
    },
    minScore: 75,
    maxScore: 100,
  },
  {
    name: "empty sample",
    input: {
      deliveryIntent: "ETH/USD spot price",
      sample: "",
      fields: {},
    },
    minScore: 0,
    maxScore: 35,
  },
  {
    name: "scam phrasing",
    input: {
      deliveryIntent: "market data feed",
      sample: "click here for free money scam offer",
      fields: {},
    },
    minScore: 0,
    maxScore: 60,
  },
  {
    name: "intent mismatch",
    input: {
      deliveryIntent: "weather forecast temperature celsius",
      sample: '{"status":"ok","message":"pong"}',
      fields: { status: "ok" },
    },
    minScore: 0,
    maxScore: 85,
  },
  {
    name: "price intent missing number",
    input: {
      deliveryIntent: "ETH/USD oracle price usd",
      sample: '{"symbol":"ETH","note":"no price"}',
      fields: { symbol: "ETH" },
    },
    minScore: 0,
    maxScore: 75,
  },
];

let failed = 0;

for (const c of judgeCases) {
  const r = heuristicJudge(c.input);
  if (r.score < c.minScore || r.score > c.maxScore) {
    console.error(`FAIL ${c.name}: score ${r.score} not in [${c.minScore}, ${c.maxScore}]`, r.reasons);
    failed++;
  } else {
    console.log(`ok ${c.name} score=${r.score} mode=${r.mode}`);
  }
}

const releaseCase = await runSemanticQualityEscrow({
  action: "settle",
  deliveryIntent: "ETH/USD spot oracle price with symbol",
  releaseThreshold: 72,
  expectedProfile: { requiredKeys: ["price", "symbol"], forbidEmpty: true },
  actualResponse: {
    bodyKeys: ["price", "symbol"],
    byteLength: 48,
    empty: false,
    fields: { price: 3450.12, symbol: "ETH" },
    sample: '{"price":3450.12,"symbol":"ETH"}',
  },
});

const releaseDecision = (releaseCase as { decision?: string }).decision;
if (releaseDecision !== "release-to-merchant") {
  console.error("FAIL semantic escrow release case:", releaseCase);
  failed++;
} else {
  console.log("ok semantic escrow releases on good delivery");
}

const refundCase = await runSemanticQualityEscrow({
  action: "settle",
  deliveryIntent: "ETH/USD spot oracle price with symbol",
  releaseThreshold: 72,
  expectedProfile: { requiredKeys: ["price", "symbol"], forbidEmpty: true },
  actualResponse: {
    bodyKeys: [],
    byteLength: 0,
    empty: true,
    fields: {},
    sample: "",
  },
});

const refundDecision = (refundCase as { decision?: string }).decision;
if (refundDecision !== "auto-refund-to-payer") {
  console.error("FAIL semantic escrow refund case:", refundCase);
  failed++;
} else {
  console.log("ok semantic escrow refunds on empty delivery");
}

if (failed > 0) {
  console.error(`\n${failed} golden test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${judgeCases.length + 2} golden tests passed`);
