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
  version: "1.2.0",
});

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
  "trust_alchemy_preflight",
  "Preflight guard tuned for x402.alchemy.com ($0.05)",
  {
    agentId: z.string(),
    walletAddress: z.string(),
    estimatedCostUsdc: z.number().optional(),
    dailyCapUsdc: z.number().optional(),
    perCallCapUsdc: z.number().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/guard/pre-x402", {
      agentId: args.agentId,
      walletAddress: args.walletAddress,
      targetUrl: "https://x402.alchemy.com/base-mainnet/v2",
      estimatedCostUsdc: args.estimatedCostUsdc ?? 1,
      network: "eip155:8453",
      policy: {
        dailyCapUsdc: args.dailyCapUsdc ?? 20,
        perCallCapUsdc: args.perCallCapUsdc ?? 2,
        allowedHosts: ["x402.alchemy.com"],
      },
    });
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
  "trust_guard_preflight",
  "Lightweight spend + identity + risk gate ($0.05)",
  {
    agentId: z.string(),
    walletAddress: z.string(),
    targetUrl: z.string().url(),
    estimatedCostUsdc: z.number(),
    network: z.string().optional(),
    policy: policySchema.extend({ allowedHosts: z.array(z.string()) }),
  },
  async (args) => {
    const data = await paidPost("/api/guard/pre-x402", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_merchant_score",
  "Know-Your-Merchant trust score before payment ($0.06)",
  {
    host: z.string(),
    targetUrl: z.string().url().optional(),
    washTradePct: z.number().optional(),
    verifiedResources: z.number().optional(),
    totalResources: z.number().optional(),
    probe: z.boolean().optional(),
  },
  async (args) => {
    const data = await paidPost("/api/merchant-trust/score", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "trust_mandate_verify",
  "Verify a proposed payment against a signed mandate ($0.02)",
  {
    mandateId: z.string(),
    proposed: z.object({
      amountUsdc: z.number(),
      merchant: z.string(),
      category: z.string(),
      rail: z.string(),
    }),
  },
  async (args) => {
    const data = await paidPost("/api/mandate/verify", args);
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
    settlement: z.object({
      transaction: z.string(),
      amountUsdc: z.number(),
      network: z.string(),
      payer: z.string(),
    }),
  },
  async (args) => {
    const data = await paidPost("/api/receipt-auditor/verify", args);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[x402-trust-layer-mcp] ready — base=" + BASE);
}

main().catch((err) => {
  console.error("[x402-trust-layer-mcp] fatal:", err);
  process.exit(1);
});
