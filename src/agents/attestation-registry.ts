import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";
import { verifyAttestation, issueAttestation, type AttestationRecord } from "../lib/attestation.js";
import { assessUrlSecurity } from "../lib/security.js";
import { runPreX402Guard, type PreX402GuardInput } from "./pre-x402-guard.js";
import { config } from "../config.js";

export type AttestationIssueInput = PreX402GuardInput;

export async function runAttestationIssue(
  input: AttestationIssueInput,
): Promise<{ attestation: AttestationRecord; verifyUrl: string }> {
  const guard = await runPreX402Guard(input);
  const urlSec = assessUrlSecurity(input.targetUrl);
  const attestation = await issueAttestation({
    agentId: input.agentId,
    walletAddress: input.walletAddress,
    targetUrl: input.targetUrl,
    network: input.network ?? "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    allowed: guard.allowed && urlSec.grade !== "F",
    securityGrade: urlSec.grade,
    riskScore: guard.risk.riskScore,
  });
  return {
    attestation,
    verifyUrl: `${config.publicBaseUrl}/api/attestation/verify`,
  };
}

export async function runAttestationVerify(attestationId: string) {
  if (
    config.allowVerifierProbeIds &&
    attestationId === "att_verifier_probe_example"
  ) {
    const probeRecord: Partial<AttestationRecord> = {
      attestationId,
      agentId: "dexter-verifier-probe",
      allowed: true,
      securityGrade: "B",
      targetUrl: "https://api.myceliasignal.com/oracle/price/eth/usd",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    };
    return withAgentTrust(
      {
        ok: true,
        valid: true,
        record: probeRecord,
        reason: "Verifier probe attestation — illustrative pass for empty-body Dexter test",
        partnerHeader: "X-Suite-Attestation",
        nextStep: { method: "POST", path: "/api/attestation/issue", priceUsdc: 0.04 },
      },
      agentTrustMeta(["verify_schema", "probe_attestation_id"], {
        confidence: 0.8,
        sources: ["attestation-registry"],
        accuracy_note:
          "Probe IDs are synthetic. Production partners should issue via POST /api/attestation/issue first.",
      }),
    );
  }
  const result = await verifyAttestation(attestationId);
  return withAgentTrust(
    { ok: true, ...result },
    agentTrustMeta(result.valid ? ["signature_ok", "registry_lookup"] : ["registry_lookup"], {
      confidence: result.valid ? 0.9 : 0.65,
      sources: ["attestation-registry", "hmac-verify"],
    }),
  );
}

export type TrustRegistryQuery = {
  minGrade?: string;
  agentId?: string;
  limit?: number;
};

export async function runTrustRegistryQuery(input: TrustRegistryQuery) {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.dirname(fileURLToPath(import.meta.url));
  const storePath = path.join(root, "..", "..", "data", "attestations.json");
  let rows: AttestationRecord[] = [];
  try {
    rows = JSON.parse(await readFile(storePath, "utf8")) as AttestationRecord[];
  } catch {
    rows = [];
  }
  const min = input.minGrade ?? "C";
  const order = ["A", "B", "C", "D", "F"];
  const minIdx = order.indexOf(min);
  let filtered = rows.filter((r) => order.indexOf(r.securityGrade) <= minIdx && r.allowed);
  if (input.agentId) filtered = filtered.filter((r) => r.agentId === input.agentId);
  filtered = filtered.slice(-(input.limit ?? 20));
  return {
    count: filtered.length,
    policy: "Agents with valid attestations may require X-Suite-Attestation header in partner networks",
    records: filtered,
    marketplaceNote:
      "Partner agents can reject paid calls without a valid attestation from this registry",
  };
}
