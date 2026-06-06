import type { Request, Response } from "express";
import { runSellerCertify, runBuyerGate } from "../agents/trust-network.js";
import { runAttestationIssue, runAttestationVerify } from "../agents/attestation-registry.js";

export async function handleMcpListTools(req: Request, res: Response): Promise<void> {
  res.json({
    tools: [
      {
        name: "certify_seller",
        description: "Certify an agent merchant or seller host with custom verification policies",
        inputSchema: {
          type: "object",
          properties: {
            host: { type: "string", description: "The host domain of the seller API (e.g. api.coingecko.com)" },
            washTradePct: { type: "number", description: "Percentage of wash trade indicator (0-100)" },
            verifiedResources: { type: "number", description: "Number of verified resources" },
            totalResources: { type: "number", description: "Total resources exposed" },
            observedTxns: { type: "number", description: "Number of transactions observed" },
            observedVolumeUsdc: { type: "number", description: "Total transacted volume in USDC" },
            p50LatencyMs: { type: "number", description: "p50 response latency in milliseconds" },
            policy: {
              type: "object",
              properties: {
                requireAttestation: { type: "boolean", description: "Whether clients must present a trust attestation" },
                minAgentTier: { type: "string", enum: ["BRONZE", "SILVER", "GOLD", "PLATINUM"], description: "Minimum required buyer wallet tier" },
                minTrustScore: { type: "number", description: "Minimum required buyer trust score (0-100)" },
              },
              required: ["requireAttestation"],
            },
          },
          required: ["host"],
        },
      },
      {
        name: "issue_attestation",
        description: "Issue a signed pre-flight attestation for an AI agent buyer wallet to access certified APIs",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "Identifier of the client AI agent" },
            walletAddress: { type: "string", description: "Wallet address of the agent (EVM or Solana)" },
            targetUrl: { type: "string", description: "The URL of the API endpoint being called" },
            estimatedCostUsdc: { type: "number", description: "The estimated cost of the call in USDC" },
          },
          required: ["agentId", "walletAddress", "targetUrl", "estimatedCostUsdc"],
        },
      },
      {
        name: "verify_attestation",
        description: "Verify a cryptographic trust attestation signature and status",
        inputSchema: {
          type: "object",
          properties: {
            attestationId: { type: "string", description: "The unique cryptographic attestation ID" },
          },
          required: ["attestationId"],
        },
      },
      {
        name: "check_buyer_gate",
        description: "Verify a buyer's trust status and attestation details at the seller API gateway level",
        inputSchema: {
          type: "object",
          properties: {
            sellerHost: { type: "string", description: "Host domain of the seller gateway" },
            walletAddress: { type: "string", description: "Wallet address of the transacting buyer" },
            attestationId: { type: "string", description: "The attestation ID passed by the buyer" },
            agentTier: { type: "string", description: "Minimum expected tier (optional, defaults to SILVER)" },
          },
          required: ["sellerHost", "walletAddress", "attestationId"],
        },
      },
    ],
  });
}

export async function handleMcpCallTool(req: Request, res: Response): Promise<void> {
  const { name, arguments: args } = req.body;

  try {
    switch (name) {
      case "certify_seller": {
        const inputArgs = {
          ...args,
          policy: args.policy || {
            requireAttestation: true,
            minAgentTier: "SILVER",
            minTrustScore: 50,
            minSecurityGrade: "C"
          }
        };
        const result = await runSellerCertify(inputArgs);
        res.json({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
        break;
      }
      case "issue_attestation": {
        const inputArgs = {
          ...args,
          policy: args.policy || {
            dailyCapUsdc: 100.0,
            perCallCapUsdc: 25.0
          }
        };
        const result = await runAttestationIssue(inputArgs);
        res.json({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
        break;
      }
      case "verify_attestation": {
        const result = await runAttestationVerify(args.attestationId);
        res.json({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
        break;
      }
      case "check_buyer_gate": {
        const result = await runBuyerGate(args);
        res.json({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
        break;
      }
      default:
        res.status(400).json({
          error: {
            code: -32601,
            message: `Method not found: ${name}`,
          },
        });
    }
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: -32603,
        message: error?.message || "Internal error executing tool",
      },
    });
  }
}
