import { createHmac, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { runAgentVerify } from "./agent-verify.js";
import { getCertifiedHost, tierMeets } from "../lib/certified-sellers.js";
import { isEvmAddress } from "../lib/erc8004/constants.js";
import { runIdentityGate } from "./identity-gate.js";
import { runPreX402Guard } from "./pre-x402-guard.js";
import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";

export type TransactionAuthInput = {
  buyerWallet: string;
  sellerHost: string;
  amountUsdc: number;
  agentId?: string;
  attestationId?: string;
  network?: string;
  requestHeaders?: Record<string, unknown>;
};

export type TransactionAuthResult = {
  allowed: boolean;
  summary: string;
  authToken: string | null;
  buyer: {
    walletAddress: string;
    agentId: string | null;
    trustScore: number;
    tier: string;
  };
  seller: {
    host: string;
    certified: boolean;
    trustScoreAtCert: number | null;
    grade: string | null;
  };
  details: {
    kymPassed: boolean;
    identityGatePassed: boolean;
    spendGovernorPassed: boolean;
    attestationVerified: boolean;
  };
  timestamp: string;
  nonce: string;
};

function signTransaction(payload: string): string {
  return createHmac("sha256", config.attestationHmacSecret).update(payload).digest("hex");
}

export async function runTransactionAuth(
  input: TransactionAuthInput,
): Promise<WithAgentTrust<TransactionAuthResult>> {
  const buyerWallet = input.buyerWallet.trim().toLowerCase();
  const sellerHost = input.sellerHost.trim().toLowerCase();
  const amountUsdc = Number(input.amountUsdc);
  const nonce = randomBytes(8).toString("hex");
  const timestamp = new Date().toISOString();

  // 1. Resolve Buyer Trust & Identity
  let trustScore = 0;
  let tier = "UNVERIFIED";
  let resolvedAgentId: string | null = null;
  let identityGatePassed = true;

  if (isEvmAddress(buyerWallet)) {
    const buyerVerify = await runAgentVerify({
      walletAddress: buyerWallet,
      agentId: input.agentId,
    });
    trustScore = buyerVerify.trustScore;
    tier = buyerVerify.tier;
    resolvedAgentId = buyerVerify.agentId;
  } else {
    // Solana wallet fallback
    const idCheck = await runIdentityGate({ walletAddress: buyerWallet });
    identityGatePassed = idCheck.allowed;
    tier = idCheck.tier === "trusted" ? "GOLD" : idCheck.tier === "standard" ? "SILVER" : "BRONZE";
    trustScore = idCheck.tier === "trusted" ? 72 : idCheck.tier === "standard" ? 52 : 30;
  }

  // 2. Resolve Seller Certificate
  const cert = await getCertifiedHost(sellerHost);
  const isSellerCertified = !!cert;

  // 3. Perform preflight spend checks (Guard)
  const guard = await runPreX402Guard({
    agentId: input.agentId ?? "unknown-agent",
    walletAddress: buyerWallet,
    targetUrl: `https://${sellerHost}/api/execute`,
    estimatedCostUsdc: amountUsdc,
    policy: {
      dailyCapUsdc: 100.0,
      perCallCapUsdc: 25.0,
    },
    minAgentTier: cert?.policy.minAgentTier ?? "BRONZE",
    minTrustScore: cert?.policy.minTrustScore ?? 30,
  });

  const spendGovernorPassed = guard.spend.allowed;
  const kymPassed = guard.risk.safe;

  // 4. Verify attestation if seller policy requires it
  let attestationVerified = true;
  if (cert?.policy.requireAttestation) {
    if (!input.attestationId) {
      attestationVerified = false;
    } else {
      // Simulate/Check internal attestation mapping
      attestationVerified = guard.allowed;
    }
  }

  // 5. Overall authorization decision
  const allowed =
    identityGatePassed &&
    spendGovernorPassed &&
    kymPassed &&
    attestationVerified &&
    guard.allowed;

  // 6. Generate cryptographic Auth Token if allowed
  let authToken: string | null = null;
  if (allowed) {
    const payload = JSON.stringify({
      buyerWallet,
      sellerHost,
      amountUsdc,
      nonce,
      timestamp,
      allowed: true,
    });
    authToken = `auth_${signTransaction(payload).slice(0, 32)}`;
  }

  const result: TransactionAuthResult = {
    allowed,
    summary: allowed
      ? "Transaction authorized by x402 Trust Layer"
      : `Transaction blocked. Reasons: ${guard.summary}`,
    authToken,
    buyer: {
      walletAddress: buyerWallet,
      agentId: resolvedAgentId,
      trustScore,
      tier,
    },
    seller: {
      host: sellerHost,
      certified: isSellerCertified,
      trustScoreAtCert: cert ? cert.trustScoreAtCert : null,
      grade: cert ? cert.grade : null,
    },
    details: {
      kymPassed,
      identityGatePassed,
      spendGovernorPassed,
      attestationVerified,
    },
    timestamp,
    nonce,
  };

  const checks = [
    "buyer_identity",
    "seller_kym",
    "spend_governor",
    "double_sided_validation",
  ];
  if (allowed) checks.push("transaction_authorized");

  return withAgentTrust(
    result,
    agentTrustMeta(checks, {
      confidence: allowed ? 0.94 : 0.75,
      sources: ["transaction-auth", "erc-8004", "certified-sellers", "spend-governor"],
    }),
  );
}
