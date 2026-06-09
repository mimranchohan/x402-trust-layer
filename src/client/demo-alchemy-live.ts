/**
 * Live Alchemy x402 + Trust Layer demo.
 *
 * Prerequisites:
 *   EVM_PRIVATE_KEY — Base wallet with ~$3 USDC (not your PAY_TO_EVM receive wallet)
 *   Optional: ALCHEMY_DEMO_ENTERPRISE=1 for mandate + compliance ledger steps
 *
 * Run: npm run demo:alchemy
 */
import dotenv from "dotenv";
import { getWalletAddress } from "@alchemy/x402";
import { wrapFetch } from "@dexterai/x402/client";
import { CHAIN_IDS } from "../lib/chains.js";
import { alchemyX402Pay } from "../lib/alchemy-x402-fetch.js";
import {
  assertDemoPayerNotReceiveWallet,
  assertPayerKeys,
  buildWrapFetchOptions,
} from "../lib/x402-client-options.js";

dotenv.config();

const TRUST_BASE = (process.env.TRUST_LAYER_BASE ?? "https://x402trustlayer.xyz").replace(/\/$/, "");
const ALCHEMY_GATEWAY = "https://x402.alchemy.com/base-mainnet/v2";
const ALCHEMY_HOST = "x402.alchemy.com";
const AGENT_ID = process.env.ALCHEMY_DEMO_AGENT_ID ?? "alchemy-live-demo-1";
const ENTERPRISE =
  process.env.ALCHEMY_DEMO_ENTERPRISE === "1" || process.argv.includes("--enterprise");
const ESTIMATED_ALCHEMY_USDC = Number(process.env.ALCHEMY_DEMO_CREDIT_USDC ?? "1");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type CostLine = { step: string; usdc: number; note: string };
const costs: CostLine[] = [];

function logStep(n: number, title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`STEP ${n}: ${title}`);
  console.log("=".repeat(60));
}

function trackCost(step: string, usdc: number, note: string) {
  costs.push({ step, usdc, note });
  console.log(`  💰 ~$${usdc.toFixed(2)} USDC — ${note}`);
}

async function main() {
  console.log("Alchemy x402 + Trust Layer — LIVE demo");
  console.log(`Trust Layer: ${TRUST_BASE}`);
  console.log(`Alchemy gateway: ${ALCHEMY_GATEWAY}`);
  console.log(`Enterprise mode: ${ENTERPRISE ? "ON (mandate + ledger)" : "OFF"}`);
  console.log("");

  if (!process.env.EVM_PRIVATE_KEY?.trim()) {
    throw new Error("EVM_PRIVATE_KEY is required for Alchemy SIWE + Base USDC payments");
  }

  assertPayerKeys();
  await assertDemoPayerNotReceiveWallet();

  const evmKey = process.env.EVM_PRIVATE_KEY!.trim();
  const walletAddress = getWalletAddress(evmKey);
  console.log(`Payer wallet: ${walletAddress}`);

  const trustFetch = wrapFetch(fetch, {
    ...buildWrapFetchOptions({ verbose: process.env.X402_VERBOSE === "1" }),
    preferredNetwork: CHAIN_IDS.base,
  });

  async function trustPost(path: string, body: unknown, priceUsdc: number, label: string) {
    const res = await trustFetch(`${TRUST_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    trackCost(label, priceUsdc, path);
    return json as Record<string, unknown>;
  }

  let mandateId: string | undefined;

  if (ENTERPRISE) {
    logStep(1, "Mandate compile (human intent → signed scope)");
    const mandate = await trustPost(
      "/api/mandate/compile",
      {
        principal: "demo:cfo",
        agentId: AGENT_ID,
        intent: "Query Alchemy blockchain data via x402 gateway for agent demo",
        maxPerTxUsdc: 2,
        dailyCapUsdc: 20,
        allowedMerchants: [ALCHEMY_HOST],
        allowedCategories: ["blockchain-data"],
        allowedRails: ["base-x402"],
        ttlMinutes: 1440,
      },
      0.08,
      "mandate compile",
    );
    const mandateRecord =
      mandate.mandate && typeof mandate.mandate === "object"
        ? (mandate.mandate as Record<string, unknown>)
        : null;
    mandateId =
      (typeof mandateRecord?.mandateId === "string" && mandateRecord.mandateId) ||
      (typeof mandate.mandateId === "string" ? mandate.mandateId : undefined);
    if (!mandateId) {
      throw new Error("Mandate compile did not return mandateId — check /api/mandate/compile response");
    }
    console.log(JSON.stringify({ mandateId, verifyUrl: mandate.verifyUrl }, null, 2));

    logStep(2, "Mandate verify (proposed payment in scope?)");
    const verify = await trustPost(
      "/api/mandate/verify",
      {
        mandateId,
        proposed: {
          amountUsdc: ESTIMATED_ALCHEMY_USDC,
          merchant: ALCHEMY_HOST,
          category: "blockchain-data",
          rail: "base-x402",
        },
      },
      0.02,
      "mandate verify",
    );
    console.log(
      JSON.stringify(
        { withinScope: verify.withinScope, reason: verify.reason, violations: verify.violations },
        null,
        2,
      ),
    );
    if (verify.withinScope === false) {
      throw new Error(`Mandate verify failed: ${String(verify.reason)}`);
    }
  }

  const guardStep = ENTERPRISE ? 3 : 1;
  logStep(guardStep, "Trust Layer guard — allowed to pay Alchemy?");
  const guard = await trustPost(
    "/api/guard/pre-x402",
    {
      agentId: AGENT_ID,
      walletAddress,
      targetUrl: ALCHEMY_GATEWAY,
      estimatedCostUsdc: ESTIMATED_ALCHEMY_USDC,
      network: CHAIN_IDS.base,
      policy: {
        dailyCapUsdc: 20,
        perCallCapUsdc: 2,
        allowedHosts: [ALCHEMY_HOST],
      },
    },
    0.05,
    "guard pre-x402",
  );
  console.log(
    JSON.stringify(
      {
        allowed: guard.allowed,
        securityGrade: guard.securityGrade,
        summary: guard.summary,
        confidence: guard.confidence,
      },
      null,
      2,
    ),
  );
  if (guard.allowed !== true) {
    throw new Error(`Guard blocked: ${String(guard.summary)}`);
  }

  const alchemyStep = guardStep + 1;
  logStep(alchemyStep, "Alchemy x402 call — SIWE auth + USDC payment");
  console.log("  Calling eth_blockNumber via x402.alchemy.com …");

  const alchemyBody = JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_blockNumber",
    params: [],
    id: 1,
  });

  const alchemyResult = await alchemyX402Pay(ALCHEMY_GATEWAY, alchemyBody, evmKey);
  if (!alchemyResult.ok) {
    throw new Error(
      `Alchemy payment failed HTTP ${alchemyResult.status}: ${alchemyResult.body.slice(0, 400)}`,
    );
  }

  trackCost("Alchemy gateway credit", ESTIMATED_ALCHEMY_USDC, "x402.alchemy.com (~$1 credit purchase)");

  let alchemyJson: unknown;
  try {
    alchemyJson = alchemyResult.body ? JSON.parse(alchemyResult.body) : null;
  } catch {
    alchemyJson = {
      raw: alchemyResult.body.slice(0, 300),
      note: "USDC payment settled; full RPC may need SIWE auth on follow-up calls",
    };
  }

  const payment = alchemyResult.payment;
  console.log(JSON.stringify({ alchemyResult: alchemyJson, payment }, null, 2));

  const txHash = payment?.transaction ?? payment?.txHash;
  if (!txHash) {
    console.warn("  ⚠ No PAYMENT-RESPONSE tx hash — receipt verify may use synthetic probe values");
  }

  const receiptStep = alchemyStep + 1;
  logStep(receiptStep, "Receipt verify — on-chain settlement proof");
  const receipt = await trustPost(
    "/api/receipt-auditor/verify",
    {
      network: CHAIN_IDS.base,
      expectedAmountUsdc: payment?.amountUsdc ?? ESTIMATED_ALCHEMY_USDC,
      transactionHash: txHash ?? "0x0000000000000000000000000000000000000000000000000000000000000001",
      settlement: {
        transaction: txHash ?? "0x0000000000000000000000000000000000000000000000000000000000000001",
        amountUsdc: payment?.amountUsdc ?? ESTIMATED_ALCHEMY_USDC,
        network: CHAIN_IDS.base,
        payer: payment?.payer ?? walletAddress,
      },
    },
    0.05,
    "receipt verify",
  );
  console.log(JSON.stringify({ valid: receipt.valid, onChainMatch: receipt.onChainMatch }, null, 2));

  if (ENTERPRISE) {
    logStep(receiptStep + 1, "Compliance ledger — CFO audit export");
    const period = new Date().toISOString().slice(0, 7);
    const ledger = await trustPost(
      "/api/compliance/ledger",
      {
        organizationId: "alchemy-demo-org",
        period,
        records: [
          {
            merchant: ALCHEMY_HOST,
            endpoint: "eth_blockNumber",
            amountUsdc: payment?.amountUsdc ?? ESTIMATED_ALCHEMY_USDC,
            rail: "base-x402",
            network: CHAIN_IDS.base,
            category: "blockchain-data",
            agentId: AGENT_ID,
            transactionHash: txHash,
            mandateId,
            timestamp: new Date().toISOString(),
          },
        ],
      },
      0.12,
      "compliance ledger",
    );
    console.log(
      JSON.stringify(
        {
          ledgerHash: ledger.ledgerHash,
          totalSpendUsdc: ledger.totalSpendUsdc,
          policyViolations: ledger.policyViolations,
        },
        null,
        2,
      ),
    );
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("COST SUMMARY (approximate USDC spent from your wallet)");
  console.log("=".repeat(60));
  let total = 0;
  for (const c of costs) {
    total += c.usdc;
    console.log(`  ${c.step.padEnd(28)} $${c.usdc.toFixed(2).padStart(6)}  ${c.note}`);
  }
  console.log(`  ${"TOTAL".padEnd(28)} $${total.toFixed(2).padStart(6)}`);
  console.log("\n✅ Live demo complete.");
  if (txHash && txHash !== "0x0000000000000000000000000000000000000000000000000000000000000001") {
    console.log(`   Basescan: https://basescan.org/tx/${txHash}`);
  }
}

main().catch((err) => {
  console.error("\n❌ Demo failed:", err instanceof Error ? err.message : err);
  console.error("\nFix checklist:");
  console.error("  1. EVM_PRIVATE_KEY set (NOT same as PAY_TO_EVM)");
  console.error("  2. Wallet has USDC on Base (~$3 for full demo)");
  console.error("  3. npm install (includes @alchemy/x402)");
  process.exit(1);
});
