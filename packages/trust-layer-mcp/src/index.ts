#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { wrapFetch } from "@dexterai/x402/client";

const BASE = (process.env.TRUST_LAYER_BASE ?? "https://x402trustlayer.xyz").replace(/\/$/, "");

function x402Fetch() {
  const evm = process.env.EVM_PRIVATE_KEY?.trim();
  const sol = process.env.SOLANA_PRIVATE_KEY?.trim();
  if (evm) {
    return wrapFetch(fetch, {
      evmPrivateKey: evm,
      preferredNetwork: (process.env.X402_PREFERRED_NETWORK as "eip155:8453") ?? "eip155:8453",
    });
  }
  if (sol) {
    return wrapFetch(fetch, { walletPrivateKey: sol });
  }
  throw new Error("Set EVM_PRIVATE_KEY or SOLANA_PRIVATE_KEY for paid Trust Layer calls");
}

async function paidPost(path: string, body: unknown): Promise<unknown> {
  const res = await x402Fetch()(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const policySchema = z.object({
  dailyCapUsdc: z.number(),
  perCallCapUsdc: z.number(),
  allowedHosts: z.array(z.string()).optional(),
});

const server = new McpServer({
  name: "x402-trust-layer",
  version: "5.5.1",
});

server.tool(
  "trust_before_x402_fetch",
  "Full pre-pay flow: pipeline/trust-v2 (mandate diff + KYM + guard + buyer gate) — use before x402_fetch ($0.35)",
  {
    agentId: z.string(),
    walletAddress: z.string(),
    targetUrl: z.string().url(),
    estimatedCostUsdc: z.number(),
    policy: policySchema,
    mandateId: z.string().optional(),
    toolCalls: z
      .array(
        z.object({
          name: z.string(),
          url: z.string().optional(),
          amountUsdc: z.number().optional(),
          merchant: z.string().optional(),
          rail: z.string().optional(),
        }),
      )
      .optional(),
    task: z.string().optional(),
    sellerHost: z.string().optional(),
    attestationId: z.string().optional(),
    useProxy: z.boolean().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/pipeline/trust-v2", {
      ...args,
      kymBeforePay: true,
      useProxy: args.useProxy ?? false,
      issueAttestation: !args.attestationId,
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_agent_verify",
  "ERC-8004 TrustScore on Base mainnet ($0.04)",
  {
    walletAddress: z.string(),
    agentId: z.union([z.string(), z.number()]).optional(),
  },
  async (args) => {
    const data = await paidPost("/api/agent/verify", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_preflight_proxy",
  "All-in-one preflight before external x402 payment ($0.08)",
  {
    agentId: z.string(),
    walletAddress: z.string(),
    targetUrl: z.string().url(),
    estimatedCostUsdc: z.number(),
    policy: policySchema,
    issueAttestation: z.boolean().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/x402/proxy", {
      ...args,
      issueAttestation: args.issueAttestation ?? true,
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_mandate_diff",
  "Mandate vs MCP tool trace before payment ($0.04)",
  {
    mandateId: z.string(),
    toolCalls: z.array(
      z.object({
        name: z.string(),
        url: z.string().optional(),
        amountUsdc: z.number().optional(),
        merchant: z.string().optional(),
        rail: z.string().optional(),
      }),
    ),
    task: z.string().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/mandate/diff", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_merchant_score",
  "KYM score with x402watch auto-ingest ($0.06)",
  {
    host: z.string(),
    targetUrl: z.string().url().optional(),
    probe: z.boolean().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/merchant-trust/score", { ...args, autoIngest: true });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_buyer_gate",
  "Certified seller buyer gate — attestation + tier ($0.03)",
  {
    sellerHost: z.string(),
    walletAddress: z.string().optional(),
    attestationId: z.string().optional(),
    agentTier: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]).optional(),
    trustScore: z.number().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/trust-network/buyer-gate", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_semantic_settle",
  "Post-pay semantic escrow — release or auto-refund ($0.12)",
  {
    deliveryIntent: z.string(),
    payeeMerchant: z.string(),
    amountUsdc: z.number(),
    actualResponse: z.object({
      fields: z.record(z.unknown()).optional(),
      sample: z.string().optional(),
      bodyKeys: z.array(z.string()).optional(),
      byteLength: z.number().optional(),
      empty: z.boolean().optional(),
    }),
    expectedProfile: z
      .object({
        requiredKeys: z.array(z.string()).optional(),
        forbidEmpty: z.boolean().optional(),
      })
      .optional(),
  },
  async (args) => {
    const data = await paidPost("/api/quality-escrow/semantic-settle", {
      action: "settle",
      ...args,
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_receipt_verify",
  "Verify x402 settlement receipt on-chain ($0.05)",
  {
    network: z.string(),
    expectedAmountUsdc: z.number(),
    transactionHash: z.string(),
  },
  async (args) => {
    const data = await paidPost("/api/receipt-auditor/verify", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_protocol_full_pipeline",
  "Agent Trust Protocol v4 — passport, trust v2, fraud, oracle, credit, compliance, guard, replay bind ($0.45)",
  {
    agentId: z.string(),
    walletAddress: z.string(),
    targetUrl: z.string().url(),
    estimatedCostUsdc: z.number(),
    policy: policySchema,
    organizationId: z.string().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/protocol/pipeline/full-trust", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_protocol_trust_score_v2",
  "Multi-factor TrustScore v2 with cryptographic proof ($0.08)",
  {
    agentId: z.string(),
    walletAddress: z.string(),
    uptimePct: z.number().optional(),
    deliveryQualityScore: z.number().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/protocol/trust-score/v2", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_protocol_fraud_scan",
  "Graph fraud scan — Sybil, wash trading, circular payments ($0.10)",
  {
    agentId: z.string().optional(),
    walletAddress: z.string().optional(),
    merchantHost: z.string().optional(),
    amountUsdc: z.number().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/protocol/fraud/scan", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_protocol_execution_receipt",
  "Proof of Execution receipt after paid API call ($0.05)",
  {
    agentId: z.string(),
    targetUrl: z.string().url().optional(),
    toolTrace: z
      .array(
        z.object({
          name: z.string(),
          url: z.string().optional(),
          amountUsdc: z.number().optional(),
        }),
      )
      .optional(),
    decisionTrace: z.array(z.string()).optional(),
    settlement: z
      .object({
        transactionHash: z.string().optional(),
        network: z.string().optional(),
        amountUsdc: z.number().optional(),
      })
      .optional(),
    responseSummary: z.string().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/protocol/execution/issue", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_protocol_credit_score",
  "AI Agent Credit Bureau score 300-900 ($0.06)",
  {
    agentId: z.string(),
    walletAddress: z.string(),
    disputeCount: z.number().optional(),
    settlementCount: z.number().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/protocol/credit/score", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[x402-trust-layer-mcp] v5.5.1 ready — base=" + BASE);
}

main().catch((err) => {
  console.error("[x402-trust-layer-mcp] fatal:", err);
  process.exit(1);
});
