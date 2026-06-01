import { runMerchantTrust } from "./merchant-trust.js";
import { runAttestationVerify } from "./attestation-registry.js";
import { runAgentVerify } from "./agent-verify.js";
import { runIdentityGate } from "./identity-gate.js";
import { isEvmAddress } from "../lib/erc8004/constants.js";
import {
  getCertifiedHost,
  listCertifiedHosts,
  upsertCertification,
  slashSellerBond,
  tierMeets,
  gradeMeets,
  type AgentTier,
  type SellerAccessPolicy,
} from "../lib/certified-sellers.js";
import { hostOf } from "../lib/probe.js";
import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";
import { config } from "../config.js";

export type SellerCertifyInput = {
  host?: string;
  targetUrl?: string;
  ttlDays?: number;
  washTradePct?: number;
  verifiedResources?: number;
  totalResources?: number;
  observedTxns?: number;
  observedVolumeUsdc?: number;
  p50LatencyMs?: number;
  probe?: boolean;
  policy?: Partial<SellerAccessPolicy>;
  goodResponseProfile?: {
    requiredKeys?: string[];
    minLengthBytes?: number;
    forbidEmpty?: boolean;
  };
  /** Minimum KYM trust score to certify (default 70) */
  minTrustScoreToCertify?: number;
  /** Virtual USDC bond recorded on certification (slash on failed delivery) */
  bondUsdc?: number;
};

export type BuyerGateInput = {
  sellerHost: string;
  walletAddress?: string;
  attestationId?: string;
  agentTier?: AgentTier;
  trustScore?: number;
  securityGrade?: string;
};

/**
 * Seller certification — KYM pass + signed badge + access policy for premium APIs.
 */
export async function runSellerCertify(input: SellerCertifyInput) {
  const host = (input.host || hostOf(input.targetUrl ?? "") || "").toLowerCase();
  if (!host) {
    return withAgentTrust(
      { ok: false, certified: false, error: "host or targetUrl required" },
      agentTrustMeta(["input_validation"], { confidence: 0.4, sources: ["trust-network"] }),
    );
  }

  const kym = await runMerchantTrust({
    host,
    targetUrl: input.targetUrl,
    washTradePct: input.washTradePct,
    verifiedResources: input.verifiedResources,
    totalResources: input.totalResources,
    observedTxns: input.observedTxns,
    observedVolumeUsdc: input.observedVolumeUsdc,
    p50LatencyMs: input.p50LatencyMs,
    probe: input.probe ?? true,
    autoIngest: true,
  });

  const minScore = input.minTrustScoreToCertify ?? 70;
  if (kym.trustScore < minScore || kym.recommendation === "avoid") {
    return withAgentTrust(
      {
        ok: true,
        certified: false,
        host,
        kym,
        reason: `Trust score ${kym.trustScore} below certification minimum ${minScore} or recommendation=${kym.recommendation}`,
        nextStep: {
          method: "POST",
          path: "/api/merchant-trust/score",
          note: "Improve verification ratio and wash-trade metrics before re-applying",
        },
      },
      agentTrustMeta(["kym_fail"], { confidence: 0.85, sources: ["trust-network", "merchant-trust"] }),
    );
  }

  const policy: SellerAccessPolicy = {
    requireAttestation: input.policy?.requireAttestation ?? true,
    minAgentTier: input.policy?.minAgentTier ?? "SILVER",
    minTrustScore: input.policy?.minTrustScore ?? 50,
    minSecurityGrade: input.policy?.minSecurityGrade ?? "C",
  };

  const record = await upsertCertification({
    host,
    trustScoreAtCert: kym.trustScore,
    grade: kym.grade,
    recommendation: kym.recommendation,
    policy,
    goodResponseProfile: input.goodResponseProfile,
    ttlDays: input.ttlDays ?? 30,
    bondUsdc: input.bondUsdc,
  });

  return withAgentTrust(
    {
      ok: true,
      certified: true,
      host,
      badgeId: record.badgeId,
      badgeHeader: "X-Suite-Certified-Seller",
      expiresAt: record.expiresAt,
      verifyUrl: `${config.publicBaseUrl}/api/merchant-trust/certified/${encodeURIComponent(host)}`,
      policy: record.policy,
      goodResponseProfile: record.goodResponseProfile ?? null,
      kym: { trustScore: kym.trustScore, grade: kym.grade, recommendation: kym.recommendation },
      bondUsdc: record.bondUsdc ?? null,
      bondRemainingUsdc: record.bondRemainingUsdc ?? null,
      usage:
        "Buyers call POST /api/trust-network/buyer-gate before paying your x402 APIs. Require X-Suite-Attestation when policy.requireAttestation is true.",
    },
    agentTrustMeta(["certified_seller", "kym_pass"], {
      confidence: 0.88,
      sources: ["trust-network", "merchant-trust"],
    }),
  );
}

export async function runCertifiedLookup(host: string) {
  const h = host.toLowerCase();
  const record = await getCertifiedHost(h);
  if (!record) {
    return {
      ok: true,
      certified: false,
      host: h,
      message: "No active certification for this host",
      certifyUrl: `${config.publicBaseUrl}/api/merchant-trust/certify`,
    };
  }
  return {
    ok: true,
    certified: true,
    host: h,
    badgeId: record.badgeId,
    expiresAt: record.expiresAt,
    trustScoreAtCert: record.trustScoreAtCert,
    grade: record.grade,
    policy: record.policy,
    goodResponseProfile: record.goodResponseProfile ?? null,
    bondUsdc: record.bondUsdc ?? null,
    bondRemainingUsdc: record.bondRemainingUsdc ?? null,
    buyerGateUrl: `${config.publicBaseUrl}/api/trust-network/buyer-gate`,
  };
}

export async function runCertifiedCatalog(limit?: number) {
  const rows = await listCertifiedHosts(limit ?? 50);
  return {
    count: rows.length,
    certifiedSellers: rows.map((r) => ({
      host: r.host,
      badgeId: r.badgeId,
      expiresAt: r.expiresAt,
      grade: r.grade,
      policy: r.policy,
    })),
  };
}

/**
 * Buyer gate — certified sellers can require attestation + minimum agent tier/score.
 */
export async function runBuyerGate(input: BuyerGateInput) {
  const sellerHost = input.sellerHost.toLowerCase();
  const cert = await getCertifiedHost(sellerHost);

  if (!cert) {
    return withAgentTrust(
      {
        ok: true,
        allowed: true,
        certifiedSeller: false,
        summary: "Seller is not in Trust Layer certified network — no extra gate",
        sellerHost,
      },
      agentTrustMeta(["uncertified_seller_open"], { confidence: 0.7, sources: ["trust-network"] }),
    );
  }

  const violations: string[] = [];
  const signals: string[] = [];
  const policy = cert.policy;

  let attestationValid = false;
  let attestationGrade: string | null = null;
  if (policy.requireAttestation) {
    if (!input.attestationId) {
      violations.push("Certified seller requires X-Suite-Attestation (attestationId missing)");
    } else {
      const att = await runAttestationVerify(input.attestationId);
      attestationValid = Boolean((att as { valid?: boolean }).valid);
      const rec = (att as { record?: { securityGrade?: string } }).record;
      attestationGrade = rec?.securityGrade ? String(rec.securityGrade) : null;
      if (!attestationValid) violations.push("Attestation invalid or expired");
      if (attestationGrade && !gradeMeets(policy.minSecurityGrade, attestationGrade)) {
        violations.push(`Attestation security grade ${attestationGrade} below required ${policy.minSecurityGrade}`);
      }
    }
  }

  let agentTier: AgentTier = input.agentTier ?? "BRONZE";
  let trustScore = input.trustScore ?? 0;

  if (input.walletAddress && (!input.agentTier || input.trustScore === undefined)) {
    try {
      if (isEvmAddress(input.walletAddress)) {
        const av = await runAgentVerify({ walletAddress: input.walletAddress });
        if (av && typeof av === "object" && "tier" in av) {
          const rawTier = String((av as { tier: string }).tier).toUpperCase();
          agentTier = (["BRONZE", "SILVER", "GOLD", "PLATINUM"].includes(rawTier)
            ? rawTier
            : "BRONZE") as AgentTier;
          trustScore = Number((av as { trustScore?: number }).trustScore ?? trustScore);
        }
      } else {
        const id = await runIdentityGate({ walletAddress: input.walletAddress });
        agentTier =
          id.tier === "trusted" ? "GOLD" : id.tier === "standard" ? "SILVER" : "BRONZE";
        trustScore = id.tier === "trusted" ? 68 : id.tier === "standard" ? 52 : 28;
        if (!id.allowed) violations.push("Solana wallet failed identity baseline");
        signals.push(`Solana identity tier mapped to ${agentTier} (trustScore ${trustScore})`);
      }
    } catch {
      violations.push("Could not resolve wallet trust — supply agentTier/trustScore or retry");
    }
  }

  if (!tierMeets(policy.minAgentTier, agentTier)) {
    violations.push(`Agent tier ${agentTier} below seller minimum ${policy.minAgentTier}`);
  }
  if (trustScore < policy.minTrustScore) {
    violations.push(`Trust score ${trustScore} below seller minimum ${policy.minTrustScore}`);
  }

  const allowed = violations.length === 0;

  return withAgentTrust(
    {
      ok: true,
      allowed,
      certifiedSeller: true,
      sellerHost,
      badgeId: cert.badgeId,
      policy,
      agentTier,
      trustScore,
      attestationValid,
      violations,
      signals,
      summary: allowed
        ? "Buyer passes certified seller gate — proceed to x402 payment"
        : "Buyer blocked by certified seller policy",
      requiredHeaders: policy.requireAttestation
        ? { "X-Suite-Attestation": "attestationId from POST /api/attestation/issue" }
        : null,
      semanticEscrowHint: cert.goodResponseProfile
        ? { method: "POST", path: "/api/quality-escrow/semantic-settle", profile: cert.goodResponseProfile }
        : null,
    },
    agentTrustMeta(allowed ? ["buyer_gate_pass"] : ["buyer_gate_block"], {
      confidence: 0.9,
      sources: ["trust-network", "certified-seller"],
    }),
  );
}

export async function runBondSlash(input: {
  sellerHost: string;
  amountUsdc: number;
  reason: string;
  qualityScore?: number;
}) {
  const host = input.sellerHost.toLowerCase();
  const cert = await getCertifiedHost(host);
  if (!cert?.bondRemainingUsdc) {
    return withAgentTrust(
      {
        ok: false,
        slashed: false,
        reason: "Seller has no active bond",
        host,
      },
      agentTrustMeta(["no_bond"], { confidence: 0.85, sources: ["trust-network"] }),
    );
  }
  const result = await slashSellerBond(host, input.amountUsdc, input.reason);
  return withAgentTrust(
    {
      ok: result.ok,
      slashed: result.ok,
      host,
      slashedUsdc: result.slashedUsdc,
      bondRemainingUsdc: result.bondRemainingUsdc,
      reason: input.reason,
      qualityScore: input.qualityScore ?? null,
      note: result.ok
        ? "Virtual bond reduced — on-chain payout is integrator responsibility"
        : "Insufficient bond remaining",
    },
    agentTrustMeta(result.ok ? ["bond_slashed"] : ["bond_insufficient"], {
      confidence: 0.88,
      sources: ["trust-network", "seller-bond"],
    }),
  );
}
