/** OpenAPI / Bazaar summaries per route */
export const ENDPOINT_META: Record<string, { summary: string; tags: string[] }> = {
  "/api/x402/proxy": {
    summary: "x402 proxy: guard + security + attestation in one call",
    tags: ["x402", "proxy", "preflight", "guard"],
  },
  "/api/mpp/session": {
    summary: "MPP session v2: open, voucher, close",
    tags: ["mpp", "batch", "solana"],
  },
  "/api/attestation/issue": {
    summary: "Issue signed preflight attestation",
    tags: ["attestation", "trust", "security"],
  },
  "/api/attestation/verify": {
    summary: "Verify attestation signature",
    tags: ["attestation", "verify"],
  },
  "/api/attestation/registry": {
    summary: "Query attestation registry",
    tags: ["attestation", "registry"],
  },
  "/api/guard/pre-x402": {
    summary: "Pre-x402 guard: spend + identity + risk in one call",
    tags: ["guard", "preflight", "policy"],
  },
  "/api/agent/verify": {
    summary: "ERC-8004 TrustScore on Base mainnet",
    tags: ["erc-8004", "identity", "trust-score"],
  },
  "/api/pipeline/execute": {
    summary: "One-shot pipeline: guard, plan, facilitator, marketplace routing",
    tags: ["pipeline", "orchestration"],
  },
  "/api/payment-intent/compile": {
    summary: "Compile multi-step x402 execution plan from natural language",
    tags: ["plan", "compiler"],
  },
  "/api/facilitator/failover": {
    summary: "Rank facilitators and recommend failover path",
    tags: ["facilitator", "failover"],
  },
  "/api/mpp/session-plan": {
    summary: "Estimate MPP session vs per-call settlement savings",
    tags: ["mpp", "estimate"],
  },
  "/api/spend-governor/check": {
    summary: "Enforce agent daily and per-call spend caps",
    tags: ["spend", "budget", "policy"],
  },
  "/api/identity-gate/check": {
    summary: "Wallet identity tier and risk scoring",
    tags: ["identity", "wallet"],
  },
  "/api/risk-gate/scan": {
    summary: "Probe URL security, HTTPS, and x402 payment requirements",
    tags: ["risk", "scan", "security"],
  },
  "/api/router/route": {
    summary: "Route capability query to best x402 API",
    tags: ["router", "marketplace"],
  },
  "/api/research/brief": {
    summary: "Research pipeline plan and cost estimate",
    tags: ["research", "brief"],
  },
  "/api/receipt-auditor/verify": {
    summary: "Verify x402 settlement receipt on-chain",
    tags: ["receipt", "audit", "settlement"],
  },
  "/api/refund-arbiter/evaluate": {
    summary: "Evaluate refund eligibility from verification signals",
    tags: ["refund", "arbiter"],
  },
  "/api/budget-allocator/run": {
    summary: "Allocate shared USDC pool across agent fleet",
    tags: ["budget", "fleet"],
  },
  "/api/settlement-graph/next": {
    summary: "Recommend next paid APIs after a settlement",
    tags: ["graph", "recommendations"],
  },
  "/api/quality-monitor/probe": {
    summary: "Regression probe up to 10 x402 endpoints",
    tags: ["monitor", "quality"],
  },
  "/api/evidence-locker/export": {
    summary: "Export compliance audit bundle for settlements",
    tags: ["compliance", "audit"],
  },
  "/api/agent-escrow": {
    summary: "Create, status, or release agent-to-agent USDC escrow",
    tags: ["escrow", "agents"],
  },
  "/api/market/buy-advisor": {
    summary: "x402 buy quote: rank paid APIs, policy, chain, MPP before you pay",
    tags: ["marketplace", "quote", "discovery", "jupiter-like"],
  },
  "/api/seller/audition-coach": {
    summary: "Seller audition coach: OpenAPI, 402 probes, Bazaar fixes before Dexter ingest",
    tags: ["seller", "audition", "discovery", "quality"],
  },
  "/api/merchant-trust/score": {
    summary: "Know-Your-Merchant trust + wash-trading score before payment",
    tags: ["trust", "kym", "wash-trade", "preflight"],
  },
  "/api/mandate/compile": {
    summary: "Compile a signed, scoped AP2-style payment mandate from intent",
    tags: ["mandate", "ap2", "intent", "governance"],
  },
  "/api/mandate/verify": {
    summary: "Verify mandate signature and scope a proposed payment",
    tags: ["mandate", "verify", "governance"],
  },
  "/api/rail-optimizer/route": {
    summary: "Choose best rail: Visa CLI, Stripe MPP, Circle, Base, Solana",
    tags: ["rail", "router", "visa-cli", "mpp", "cost"],
  },
  "/api/compliance/ledger": {
    summary: "CFO/SOC2-grade spend reconciliation with policy flags and tamper hash",
    tags: ["compliance", "audit", "cfo", "ledger"],
  },
  "/api/dispute/resolve": {
    summary: "Visa chargeback dossier or on-chain refund claim builder",
    tags: ["dispute", "chargeback", "visa", "refund"],
  },
  "/api/quality-escrow/settle": {
    summary: "Quality-gated escrow with response verification and auto-refund",
    tags: ["escrow", "quality", "refund", "trust"],
  },
  "/api/quality-escrow/semantic-settle": {
    summary: "Semantic delivery escrow: intent rubric + schema before release/refund",
    tags: ["escrow", "semantic", "delivery"],
  },
  "/api/mandate/diff": {
    summary: "Compare mandate scope to MCP tool trace before x402 payment",
    tags: ["mandate", "intent", "diff"],
  },
  "/api/merchant-trust/certify": {
    summary: "Certify seller: KYM pass, signed badge, buyer policy",
    tags: ["certification", "seller", "trust-network"],
  },
  "/api/trust-network/buyer-gate": {
    summary: "Certified seller buyer gate before payment",
    tags: ["trust-network", "attestation", "gate"],
  },
  "/api/pipeline/trust-v2": {
    summary: "Trust v2 bundle: mandate diff + KYM + guard + buyer gate",
    tags: ["pipeline", "trust-v2", "orchestration"],
  },
  "/api/trust-network/bond/slash": {
    summary: "Slash seller virtual bond after failed delivery",
    tags: ["bond", "slash", "trust-network"],
  },
  "/api/protocol/pipeline/full-trust": {
    summary: "Agent Trust Protocol v4 full pipeline before x402 payment",
    tags: ["protocol", "trust", "pipeline"],
  },
  "/api/protocol/passport/issue": {
    summary: "Issue Agent Passport DID verifiable credential",
    tags: ["protocol", "did", "identity"],
  },
  "/api/protocol/passport/verify": {
    summary: "Verify Agent Passport credential signature",
    tags: ["protocol", "did", "verify"],
  },
  "/api/protocol/trust-score/v2": {
    summary: "TrustScore v2 with tamper-resistant HMAC proof",
    tags: ["protocol", "trust-score"],
  },
  "/api/protocol/fraud/scan": {
    summary: "Graph fraud scan for Sybil and wash trading",
    tags: ["protocol", "fraud"],
  },
  "/api/protocol/oracle/consensus": {
    summary: "Trust oracle quorum consensus",
    tags: ["protocol", "oracle"],
  },
  "/api/protocol/execution/issue": {
    summary: "Proof of Execution task receipt",
    tags: ["protocol", "poe"],
  },
  "/api/protocol/execution/verify": {
    summary: "Verify Proof of Execution receipt",
    tags: ["protocol", "poe", "verify"],
  },
  "/api/protocol/reasoning/commit": {
    summary: "Commit reasoning audit Merkle tree",
    tags: ["protocol", "audit", "merkle"],
  },
  "/api/protocol/reasoning/disclose": {
    summary: "Selective disclosure of reasoning audit leaves",
    tags: ["protocol", "zk", "disclosure"],
  },
  "/api/protocol/escrow/create": {
    summary: "Create escrow FSM (CREATED)",
    tags: ["protocol", "escrow"],
  },
  "/api/protocol/escrow/transition": {
    summary: "Transition escrow FSM state",
    tags: ["protocol", "escrow"],
  },
  "/api/protocol/escrow/status": {
    summary: "Query escrow FSM status",
    tags: ["protocol", "escrow"],
  },
  "/api/protocol/replay/bind": {
    summary: "Replay-safe payment binding",
    tags: ["protocol", "replay", "security"],
  },
  "/api/protocol/replay/verify": {
    summary: "Verify and consume replay binding",
    tags: ["protocol", "replay"],
  },
  "/api/protocol/zk/prove": {
    summary: "ZK-style proof of budget, reputation, or compliance",
    tags: ["protocol", "zk"],
  },
  "/api/protocol/credit/score": {
    summary: "AI Agent Credit Bureau 300-900",
    tags: ["protocol", "credit"],
  },
  "/api/protocol/compliance/assess": {
    summary: "Enterprise AML/KYC compliance assess",
    tags: ["protocol", "compliance"],
  },
};
