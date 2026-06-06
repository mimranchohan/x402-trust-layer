import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

async function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== Testing Upgraded Advanced Features (MCP, Metered Escrow, Dashboard) ===");

  const port = "3410";
  console.log(`[Setup] Starting Trust Layer Server on port ${port}...`);
  
  const trustLayerProcess = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: resolve(__dirname, ".."),
    shell: true,
    env: {
      ...process.env,
      PORT: port,
      ATTESTATION_HMAC_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      WEBHOOK_ADMIN_SECRET: "adminsecret123456",
      PAY_TO_ADDRESS: "YourSolanaBase58Address",
      PAY_TO_EVM: "0x1234567890123456789012345678901234567890",
      X402_BYPASS: "1"
    }
  });

  trustLayerProcess.stdout.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Server] ${msg}`);
  });

  trustLayerProcess.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Server ERROR] ${msg}`);
  });

  console.log("[Setup] Waiting 8 seconds for server to start...");
  await waitMs(8000);

  const baseUrl = `http://127.0.0.1:${port}`;
  let passed = true;

  try {
    // 1. Test Metered Escrow Session Open
    console.log("\n--- TEST 1: Open Metered Escrow Session ---");
    const openRes = await fetch(`${baseUrl}/api/escrow/metered/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerWallet: "0x1111111111111111111111111111111111111111",
        sellerHost: "api.example.com",
        budgetUsdc: 10.00
      })
    });
    const openData = await openRes.json() as any;
    console.log("Open Session Response:", JSON.stringify(openData, null, 2));
    if (openData.ok && openData.session.sessionId) {
      console.log("✅ TEST 1 Passed: Session opened successfully.");
    } else {
      console.error("❌ TEST 1 Failed");
      passed = false;
    }

    const sessionId = openData.session.sessionId;

    // 2. Test Metered Escrow Session Charge (Success)
    console.log("\n--- TEST 2: Charge Session (Successful Micro-deduction) ---");
    const chargeRes1 = await fetch(`${baseUrl}/api/escrow/metered/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        amountUsdc: 3.50
      })
    });
    const chargeData1 = await chargeRes1.json() as any;
    console.log("Charge 1 Response:", JSON.stringify(chargeData1, null, 2));
    if (chargeData1.ok && chargeData1.session.spentUsdc === 3.5) {
      console.log("✅ TEST 2 Passed: Charged 3.50 USDC successfully.");
    } else {
      console.error("❌ TEST 2 Failed");
      passed = false;
    }

    // 3. Test Metered Escrow Session Charge (Failure - Overdraft)
    console.log("\n--- TEST 3: Charge Session (Expected Insufficient Budget Failure) ---");
    const chargeRes2 = await fetch(`${baseUrl}/api/escrow/metered/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        amountUsdc: 8.00 // 3.50 + 8.00 = 11.50 > 10.00 budget
      })
    });
    const chargeData2 = await chargeRes2.json() as any;
    console.log("Charge 2 Response:", JSON.stringify(chargeData2, null, 2));
    if (!chargeData2.ok && chargeData2.message.includes("Insufficient escrow budget")) {
      console.log("✅ TEST 3 Passed: Overdraft blocked correctly.");
    } else {
      console.error("❌ TEST 3 Failed");
      passed = false;
    }

    // 4. Test Metered Escrow Session Close & Refund
    console.log("\n--- TEST 4: Close Session & Settle Aggregate ---");
    const closeRes = await fetch(`${baseUrl}/api/escrow/metered/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    });
    const closeData = await closeRes.json() as any;
    console.log("Close Session Response:", JSON.stringify(closeData, null, 2));
    if (closeData.ok && closeData.refundUsdc === 6.5 && closeData.settledUsdc === 3.5) {
      console.log("✅ TEST 4 Passed: Closed and refunded successfully.");
    } else {
      console.error("❌ TEST 4 Failed");
      passed = false;
    }

    // 5. Test MCP Tools Discovery Schema
    console.log("\n--- TEST 5: MCP Tools Discovery Schema ---");
    const mcpToolsRes = await fetch(`${baseUrl}/api/mcp/tools`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const mcpToolsData = await mcpToolsRes.json() as any;
    console.log("MCP List Tools Response (Truncated):", JSON.stringify(mcpToolsData.tools[0], null, 2));
    if (mcpToolsData.tools && mcpToolsData.tools.length > 0) {
      console.log("✅ TEST 5 Passed: MCP schemas discovered successfully.");
    } else {
      console.error("❌ TEST 5 Failed");
      passed = false;
    }

    // 6. Test MCP Tool Invocation
    console.log("\n--- TEST 6: MCP Tool Call Execution ---");
    const mcpCallRes = await fetch(`${baseUrl}/api/mcp/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "issue_attestation",
        arguments: {
          agentId: "mcp-test-agent",
          walletAddress: "0x1111111111111111111111111111111111111111",
          targetUrl: "https://x402trustlayer.xyz/api/health",
          estimatedCostUsdc: 0.10
        }
      })
    });
    const mcpCallData = await mcpCallRes.json() as any;
    console.log("MCP Tool Invocation Response:", JSON.stringify(mcpCallData, null, 2));
    if (mcpCallData.content && mcpCallData.content[0].text.includes("attestationId")) {
      console.log("✅ TEST 6 Passed: MCP Tool called and output returned successfully.");
    } else {
      console.error("❌ TEST 6 Failed");
      passed = false;
    }

    // 7. Test Telemetry Dashboard JSON Output
    console.log("\n--- TEST 7: Telemetry Control Plane Summary (JSON) ---");
    const dashRes = await fetch(`${baseUrl}/api/dashboard/summary`, {
      headers: { "Accept": "application/json" }
    });
    const dashData = await dashRes.json() as any;
    console.log("Dashboard Stats Response:", JSON.stringify(dashData.stats, null, 2));
    if (dashData.ok && dashData.stats.totalEscrowsCount > 0) {
      console.log("✅ TEST 7 Passed: Dashboard telemetry parsed successfully.");
    } else {
      console.error("❌ TEST 7 Failed");
      passed = false;
    }

  } catch (error) {
    console.error("Integration run encountered error:", error);
    passed = false;
  } finally {
    console.log("\n[Cleanup] Terminating server...");
    trustLayerProcess.kill();
    await waitMs(2000);
  }

  if (passed) {
    console.log("\n=== ALL UPGRADED FEATURES TESTED AND VERIFIED SUCCESSFULLY ===");
    process.exit(0);
  } else {
    console.error("\n=== SOME VERIFICATION TESTS FAILED ===");
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
