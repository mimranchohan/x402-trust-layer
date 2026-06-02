export type ThreatSurface = {
  id: string;
  layer: string;
  threat: string;
  mitigations: string[];
  residualRisk: "low" | "medium" | "high";
};

export const THREAT_CATALOG: ThreatSurface[] = [
  {
    id: "T-REPLAY-01",
    layer: "Settlement",
    threat: "Payment signature replay on different resource URL",
    mitigations: ["replay-bindings", "resourceHash", "nonce consumption", "idempotency-key"],
    residualRisk: "low",
  },
  {
    id: "T-SYBIL-01",
    layer: "Identity",
    threat: "Wallet farming / reputation farming",
    mitigations: ["erc8004-registration", "trustscore-v2-history", "fraud-graph-clusters"],
    residualRisk: "medium",
  },
  {
    id: "T-WASH-01",
    layer: "Fraud",
    threat: "Wash trading volume inflation",
    mitigations: ["merchant-trust-score", "fraud-scan", "bond-slash"],
    residualRisk: "medium",
  },
  {
    id: "T-MCP-01",
    layer: "Agent",
    threat: "Tool poisoning / prompt injection via MCP",
    mitigations: ["mandate-diff", "reasoning-audit-merkle", "guard-allowedHosts"],
    residualRisk: "medium",
  },
  {
    id: "T-ESCROW-01",
    layer: "Escrow",
    threat: "Escrow bypass / race on state transition",
    mitigations: ["escrow-fsm-valid-transitions", "stateProof-hmac", "semantic-settle"],
    residualRisk: "low",
  },
  {
    id: "T-ORACLE-01",
    layer: "Trust",
    threat: "Centralized trust manipulation",
    mitigations: ["trust-oracle-quorum", "multi-oracle-consensus", "slashing-note"],
    residualRisk: "medium",
  },
  {
    id: "T-PII-01",
    layer: "Compliance",
    threat: "PII leakage in audit logs",
    mitigations: ["prompt-hashes-only", "zk-selective-disclosure", "evidence-locker-org-scope"],
    residualRisk: "low",
  },
  {
    id: "T-DOS-01",
    layer: "API",
    threat: "Rate limit exhaustion / unpaid probe abuse",
    mitigations: ["rate-limit-unpaid", "rate-limit-per-min", "402-on-paid-routes"],
    residualRisk: "low",
  },
];

export function getThreatModel(): {
  version: string;
  surfaces: ThreatSurface[];
  attackCategories: string[];
} {
  return {
    version: "4.0.0",
    surfaces: THREAT_CATALOG,
    attackCategories: [
      "replay",
      "sybil",
      "wash_trading",
      "prompt_injection",
      "tool_poisoning",
      "escrow_bypass",
      "oracle_manipulation",
      "settlement_exploit",
      "pii_exposure",
    ],
  };
}
