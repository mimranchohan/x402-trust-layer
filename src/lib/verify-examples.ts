/** Canonical probe bodies used when Dexter AI verifier sends an empty POST body */
export const VERIFY_EXAMPLES: Record<string, unknown> = {
  "/api/x402/proxy": {
    agentId: "dexter-verifier-probe",
    walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
    targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
    estimatedCostUsdc: 0.05,
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 0.5 },
    issueAttestation: true,
  },
  "/api/mpp/session": {
    action: "open",
    expectedCalls: 25,
    avgPricePerCallUsdc: 0.03,
    chain: "solana",
    agentId: "dexter-verifier-probe",
  },
  "/api/attestation/issue": {
    agentId: "dexter-verifier-probe",
    walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
    targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
    estimatedCostUsdc: 0.03,
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 0.5 },
  },
  "/api/attestation/verify": {
    attestationId: "att_verifier_probe_example",
  },
  "/api/guard/pre-x402": {
    agentId: "dexter-verifier-probe",
    walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
    targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
    estimatedCostUsdc: 0.05,
    network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 0.5, allowedHosts: ["myceliasignal.com"] },
  },
  "/api/pipeline/execute": {
    agentId: "dexter-verifier-probe",
    walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
    targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
    estimatedCostUsdc: 0.05,
    network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 0.5, allowedHosts: ["myceliasignal.com"] },
    task: "ETH oracle with guard and marketplace routing under one dollar",
    maxBudgetUsdc: 1,
    marketplaceQuery: "ETH USD spot price oracle",
    preferNetwork: "solana",
  },
  "/api/payment-intent/compile": {
    task: "Verify spend policy for ETH oracle call under one dollar budget",
    maxBudgetUsdc: 1,
    agentId: "dexter-verifier-probe",
    externalCallEstimateUsdc: 0.05,
  },
  "/api/facilitator/failover": {
    targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
    preferNetwork: "solana",
  },
  "/api/mpp/session-plan": {
    action: "estimate",
    expectedCalls: 25,
    avgPricePerCallUsdc: 0.03,
  },
  "/api/spend-governor/check": {
    agentId: "dexter-verifier-probe",
    estimatedCostUsdc: 0.03,
    targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
    network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 0.5, allowedHosts: ["myceliasignal.com"] },
  },
  "/api/identity-gate/check": {
    walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
    maxTierSpendUsdc: 10,
  },
  "/api/risk-gate/scan": {
    targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
    estimatedCostUsdc: 0.05,
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 0.5 },
  },
  "/api/router/route": {
    query: "ETH USD spot price oracle",
    preferNetwork: "solana",
    maxPriceUsdc: 0.1,
  },
  "/api/research/brief": {
    topic: "Ethereum network fees today",
    includePrice: true,
  },
  "/api/receipt-auditor/verify": {
    network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    expectedAmountUsdc: 0.03,
    transactionHash:
      "5VERv8NMvzbJMEkV8xnrLkEbWRPnf7wDQUJwo9aH7H9f3aDu4xfVVbmAJnW9MJz6HTWu7jnQvuKv4W4vKMnBiix",
    settlement: {
      transaction:
        "5VERv8NMvzbJMEkV8xnrLkEbWRPnf7wDQUJwo9aH7H9f3aDu4xfVVbmAJnW9MJz6HTWu7jnQvuKv4W4vKMnBiix",
      amountUsdc: 0.03,
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    },
  },
  "/api/refund-arbiter/evaluate": {
    verificationScore: 85,
    responseEmpty: false,
    responseGeneric: false,
    endpointReachable: true,
  },
  "/api/budget-allocator/run": {
    fleetId: "verifier-fleet",
    poolRemainingUsdc: 1,
    agents: [
      { agentId: "a1", priority: 10, requestedUsdc: 0.2, dailyRemainingUsdc: 5 },
    ],
  },
  "/api/settlement-graph/next": {
    lastEndpointPath: "/api/spend-governor/check",
    lastTopic: "agent spend policy",
  },
  "/api/quality-monitor/probe": {
    urls: ["https://api.myceliasignal.com/oracle/price/eth/usd"],
  },
  "/api/evidence-locker/export": {
    organizationId: "verifier-org",
    records: [
      {
        endpoint: "/api/spend-governor/check",
        amountUsdc: 0.03,
        network: "solana",
        timestamp: new Date().toISOString(),
      },
    ],
  },
  "/api/agent-escrow": {
    action: "create",
    payerAgentId: "verifier-payer",
    payeeAgentId: "verifier-payee",
    amountUsdc: 0.05,
    releaseCondition: "receipt-auditor valid:true",
  },
  "/api/market/buy-advisor": {
    intent: "ETH USD spot price oracle for trading bot",
    agentId: "dexter-verifier-probe",
    walletAddress: "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt",
    preferNetwork: "eip155:8453",
    maxPriceUsdc: 0.15,
    expectedCalls: 12,
    policy: { dailyCapUsdc: 10, perCallCapUsdc: 0.5, allowedHosts: ["myceliasignal.com", "dexter.cash"] },
    dryRunTarget: true,
  },
  "/api/seller/audition-coach": {
    origin: "https://x402-agent-suite-production.up.railway.app",
    maxRoutes: 24,
  },
};
