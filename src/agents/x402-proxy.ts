import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";
import { config } from "../config.js";
import { issueAttestation } from "../lib/attestation.js";
import { type ChainKey, CHAIN_IDS } from "../lib/chains.js";
import { probeEndpoint } from "../lib/probe.js";
import { assessUrlSecurity, mergeSecurityIntoRisk } from "../lib/security.js";
import { runIdentityGate } from "./identity-gate.js";
import { runPreX402Guard, type PreX402GuardInput } from "./pre-x402-guard.js";

export type X402ProxyInput = PreX402GuardInput & {
  downstreamMethod?: "GET" | "POST";
  downstreamBody?: Record<string, unknown>;
  issueAttestation?: boolean;
  preferredChain?: ChainKey;
};

export type X402ProxyResult = {
  status: "ok";
  allowed: boolean;
  summary: string;
  nextActions: string[];
  securityGrade: string;
  riskScore: number;
  guard: Awaited<ReturnType<typeof runPreX402Guard>>;
  targetProbe: Awaited<ReturnType<typeof probeEndpoint>>;
  attestation: Awaited<ReturnType<typeof issueAttestation>> | null;
  clientFlow: {
    step1: string;
    step2: string;
    step3: string;
  };
  supportedChains: ChainKey[];
  integrationSnippet: string;
};

/** One paid call: guard + security grade + optional attestation + downstream 402 probe */
export async function runX402Proxy(
  input: X402ProxyInput,
): Promise<WithAgentTrust<X402ProxyResult>> {
  const urlSec = assessUrlSecurity(input.targetUrl);
  const guard = await runPreX402Guard(input);
  const identity = runIdentityGate({
    walletAddress: input.walletAddress,
    maxTierSpendUsdc: input.policy.perCallCapUsdc * 20,
  });
  const probe = await probeEndpoint(input.targetUrl);
  const merged = mergeSecurityIntoRisk(guard.risk.riskScore, urlSec);

  const allowed =
    guard.allowed &&
    identity.allowed &&
    merged.riskScore < 50 &&
    urlSec.grade !== "F";

  let attestation: Awaited<ReturnType<typeof issueAttestation>> | null = null;
  if (input.issueAttestation !== false) {
    attestation = await issueAttestation({
      agentId: input.agentId,
      walletAddress: input.walletAddress,
      targetUrl: input.targetUrl,
      network: input.network ?? CHAIN_IDS.solana,
      allowed,
      securityGrade: merged.securityGrade,
      riskScore: merged.riskScore,
    });
  }

  const chain = input.preferredChain ?? "solana";
  const attHeader = attestation
    ? `\n// Header for partner networks: X-Suite-Attestation: ${attestation.attestationId}`
    : "";
  const snippet = `// After proxy returns allowed:true, pay target with x402_fetch
const paid = await x402Fetch("${input.targetUrl}", { method: "${input.downstreamMethod ?? "POST"}", headers: { "content-type": "application/json" }, body: JSON.stringify(${JSON.stringify(input.downstreamBody ?? {})}) });${attHeader}`;

  const checks = ["pre_x402_guard", "identity_gate", "target_402_probe", "security_grade"];
  if (attestation) checks.push("attestation_issued");
  if (allowed) checks.push("preflight_pass");

  const supportedChains: ChainKey[] = ["solana", "base", "polygon"];
  const payload: X402ProxyResult = {
    status: "ok",
    allowed,
    summary: allowed
      ? "Proxy preflight passed — safe to pay downstream x402 endpoint"
      : `Blocked — guard/identity/security failed (grade ${merged.securityGrade})`,
    nextActions: allowed
      ? [
          `x402_fetch ${input.targetUrl}`,
          attestation
            ? `POST ${config.publicBaseUrl}/api/attestation/verify`
            : `POST ${config.publicBaseUrl}/api/receipt-auditor/verify`,
        ]
      : [
          `Review policy caps and host allowlist`,
          `Re-run POST ${config.publicBaseUrl}/api/x402/proxy after fixes`,
        ],
    securityGrade: merged.securityGrade,
    riskScore: merged.riskScore,
    guard,
    targetProbe: probe,
    attestation,
    clientFlow: {
      step1: `POST ${config.publicBaseUrl}/api/x402/proxy`,
      step2: `x402_check then x402_fetch ${input.targetUrl}`,
      step3: attestation
        ? `POST ${config.publicBaseUrl}/api/attestation/verify`
        : `POST ${config.publicBaseUrl}/api/receipt-auditor/verify`,
    },
    supportedChains,
    integrationSnippet: snippet,
  };

  return withAgentTrust(
    payload,
    agentTrustMeta(checks, {
      confidence: allowed ? 0.84 : 0.7,
      sources: ["pre-x402-guard", "probe-endpoint", "attestation-registry"],
    }),
  );
}
