import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

async function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== Starting Double-Sided Agent Trust Integration Demo ===");

  // 1. Start Trust Layer
  console.log("[Setup] Starting Trust Layer Server on port 3402...");
  const trustLayerProcess = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: resolve(__dirname, ".."),
    shell: true,
    env: {
      ...process.env,
      PORT: "3402",
      ATTESTATION_HMAC_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      WEBHOOK_ADMIN_SECRET: "adminsecret123456",
      PAY_TO_ADDRESS: "YourSolanaBase58Address",
      PAY_TO_EVM: "0x1234567890123456789012345678901234567890",
      ALLOW_VERIFIER_PROBE_IDS: "1",
      X402_BYPASS: "1"
    }
  });

  trustLayerProcess.stdout.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Trust Layer] ${msg}`);
  });

  trustLayerProcess.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Trust Layer ERROR] ${msg}`);
  });

  // 2. Start AI Memory Agent
  console.log("[Setup] Starting AI Memory Agent Server on port 4001...");
  const memoryAgentProcess = spawn("npx", ["tsx", "server.ts"], {
    cwd: resolve(__dirname, "..", "..", "x402-agents", "agents", "01-ai-memory"),
    shell: true,
    env: {
      ...process.env,
      PORT: "4001",
      TRUST_LAYER_BASE: "http://127.0.0.1:3402",
      FACILITATOR_URL: "https://x402.dexter.cash",
      X402_BYPASS: "1"
    }
  });

  memoryAgentProcess.stdout.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Memory Agent] ${msg}`);
  });

  memoryAgentProcess.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Memory Agent ERROR] ${msg}`);
  });

  // Wait for servers to spin up
  console.log("[Setup] Waiting 8 seconds for servers to initialize...");
  await waitMs(8000);

  let passed = true;

  try {
    // Certify the merchant host 'localhost' first so that the buyer gate policy is actually checked!
    console.log("\n--- Setup: Certifying 'localhost' in Trust Layer ---");
    const certifyRes = await fetch("http://127.0.0.1:3402/api/merchant-trust/certify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: "localhost",
        washTradePct: 1,
        verifiedResources: 5,
        totalResources: 5,
        observedTxns: 200,
        observedVolumeUsdc: 1500,
        p50LatencyMs: 95,
        policy: {
          requireAttestation: true,
          minAgentTier: "SILVER",
          minTrustScore: 50
        }
      })
    });
    const certifyData = (await certifyRes.json()) as any;
    console.log("Certify Seller Response:", JSON.stringify(certifyData, null, 2));

    // Test 1: Try storing without attestation
    console.log("\n--- TEST 1: Request WITHOUT Trust Attestation ---");
    const res1 = await fetch("http://127.0.0.1:4001/api/memory/store", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Simulate that payment has been processed (the x402Middleware appends these headers upon verification)
        "x-x402-receipt": "tx-receipt-token-100",
        "x-x402-payer": "0x0000000000000000000000000000000000000001"
      },
      body: JSON.stringify({ key: "wallet_backup", value: "dev_private_key_mnemonic" })
    });

    console.log(`Response Status: ${res1.status}`);
    const data1 = (await res1.json()) as any;
    console.log("Response Body:", JSON.stringify(data1, null, 2));

    if (res1.status === 403 && data1.code === "TRUST_LAYER_ATTESTATION_REQUIRED") {
      console.log("✅ Test 1 Passed: Request blocked as expected (attestation required).");
    } else {
      console.error("❌ Test 1 Failed: Request was not blocked correctly.");
      passed = false;
    }

    // Test 2: Issue attestation from Trust Layer
    console.log("\n--- TEST 2: Requesting Attestation from Trust Layer ---");
    const issueRes = await fetch("http://127.0.0.1:3402/api/attestation/issue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass X-Verifier-Fast-Path-Secret or simulate to bypass physical payment check for testing
        "x-verifier-fast-path": "true"
      },
      body: JSON.stringify({
        agentId: "1", // verifierSynthetic ID
        walletAddress: "0x0000000000000000000000000000000000000001",
        targetUrl: "https://x402trustlayer.xyz/api/health",
        estimatedCostUsdc: 0.10,
        network: "base",
        allowed: true,
        securityGrade: "A",
        riskScore: 5,
        policy: {
          dailyCapUsdc: 50.0,
          perCallCapUsdc: 5.0
        }
      })
    });

    const issueData = (await issueRes.json()) as any;
    console.log("Attestation Issue Response:", JSON.stringify(issueData, null, 2));
    const attestationId = issueData.attestationId || issueData.attestation?.attestationId;

    if (attestationId) {
      console.log(`✅ Test 2 Passed: Issued attestation ID: ${attestationId}`);
    } else {
      console.error("❌ Test 2 Failed: No attestation ID received.");
      passed = false;
    }

    // Test 3: Request with attestation
    if (attestationId) {
      console.log("\n--- TEST 3: Request WITH Trust Attestation ---");
      const res3 = await fetch("http://127.0.0.1:4001/api/memory/store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-suite-attestation": attestationId,
          "x-x402-receipt": "tx-receipt-token-100",
          "x-x402-payer": "0x0000000000000000000000000000000000000001"
        },
        body: JSON.stringify({ key: "wallet_backup", value: "dev_private_key_mnemonic" })
      });

      console.log(`Response Status: ${res3.status}`);
      const data3 = (await res3.json()) as any;
      console.log("Response Body:", JSON.stringify(data3, null, 2));

      if (res3.status === 200 && data3.ok) {
        console.log("✅ Test 3 Passed: Request allowed with valid attestation!");
      } else {
        console.error("❌ Test 3 Failed: Request blocked despite valid attestation.");
        passed = false;
      }
    }
  } catch (err) {
    console.error("Error during integration testing:", err);
    passed = false;
  } finally {
    console.log("\nCleaning up processes...");
    trustLayerProcess.kill();
    memoryAgentProcess.kill();
    await waitMs(1500);
  }

  if (passed) {
    console.log("\n=== ALL INTEGRATION TESTS PASSED SUCCESSFULLY ===");
    process.exit(0);
  } else {
    console.error("\n=== SOME INTEGRATION TESTS FAILED ===");
    process.exit(1);
  }
}

run();
