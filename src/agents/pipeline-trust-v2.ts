import { hostOf } from "../lib/probe.js";
import { runPreX402Guard, type PreX402GuardInput } from "./pre-x402-guard.js";
import { runMandateDiff, type ToolCallTrace } from "./mandate-diff.js";
import { runMerchantTrust } from "./merchant-trust.js";
import { runBuyerGate } from "./trust-network.js";
import { runX402Proxy } from "./x402-proxy.js";
import { agentTrustMeta, withAgentTrust } from "../lib/agent-response.js";

export type PipelineTrustV2Input = PreX402GuardInput & {
  mandateId?: string;
  toolCalls?: ToolCallTrace[];
  task?: string;
  sellerHost?: string;
  attestationId?: string;
  agentTier?: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  trustScore?: number;
  /** Run KYM with x402watch auto-ingest (default true when sellerHost set) */
  kymBeforePay?: boolean;
  useProxy?: boolean;
  issueAttestation?: boolean;
};

/**
 * One-shot Trust Layer v2: mandate diff → KYM → guard/proxy → certified buyer gate.
 */
export async function runPipelineTrustV2(input: PipelineTrustV2Input) {
  const steps: { step: string; allowed: boolean; summary: string }[] = [];
  let allowed = true;
  const host = input.sellerHost ?? hostOf(input.targetUrl);

  if (input.mandateId && input.toolCalls?.length) {
    const diff = await runMandateDiff({
      mandateId: input.mandateId,
      toolCalls: input.toolCalls,
      task: input.task,
      proposed: {
        amountUsdc: input.estimatedCostUsdc,
        merchant: host || undefined,
      },
    });
    const diffAllowed = Boolean((diff as { allowed?: boolean }).allowed);
    steps.push({
      step: "mandate_diff",
      allowed: diffAllowed,
      summary: String((diff as { summary?: string }).summary ?? "mandate diff"),
    });
    if (!diffAllowed) allowed = false;
  }

  if (allowed && input.kymBeforePay !== false && host) {
    const kym = await runMerchantTrust({
      host,
      targetUrl: input.targetUrl,
      autoIngest: true,
      probe: false,
    });
    const kymOk = kym.recommendation !== "avoid";
    steps.push({
      step: "merchant_trust",
      allowed: kymOk,
      summary: `KYM ${kym.grade} score ${kym.trustScore} → ${kym.recommendation}`,
    });
    if (!kymOk) allowed = false;
  }

  let guardResult: Awaited<ReturnType<typeof runPreX402Guard>>;
  if (input.useProxy) {
    const proxy = await runX402Proxy({
      ...input,
      issueAttestation: input.issueAttestation ?? true,
    });
    guardResult = proxy.guard;
    steps.push({
      step: "x402_proxy",
      allowed: proxy.allowed,
      summary: proxy.summary ?? "proxy preflight",
    });
    if (!proxy.allowed) allowed = false;
  } else {
    guardResult = await runPreX402Guard(input);
    steps.push({
      step: "pre_x402_guard",
      allowed: guardResult.allowed,
      summary: guardResult.summary,
    });
    if (!guardResult.allowed) allowed = false;
  }

  if (allowed && host) {
    const gate = await runBuyerGate({
      sellerHost: host,
      walletAddress: input.walletAddress,
      attestationId: input.attestationId,
      agentTier: input.agentTier,
      trustScore: input.trustScore,
    });
    const gateAllowed = Boolean((gate as { allowed?: boolean }).allowed);
    steps.push({
      step: "buyer_gate",
      allowed: gateAllowed,
      summary: String((gate as { summary?: string }).summary ?? "buyer gate"),
    });
    if (!gateAllowed) allowed = false;
  }

  const recommendedNextCalls = [
    allowed ? `x402_fetch ${input.targetUrl}` : null,
    "POST /api/receipt-auditor/verify",
    "POST /api/quality-escrow/semantic-settle (after response)",
  ].filter(Boolean) as string[];

  return withAgentTrust(
    {
      ok: true,
      allowed,
      summary: allowed
        ? "Trust v2 pipeline passed — safe to pay downstream x402 API"
        : "Trust v2 pipeline blocked payment",
      steps,
      guard: guardResult,
      recommendedNextCalls,
      bundleNote:
        "Replaces separate mandate/diff ($0.04) + KYM ($0.06) + guard ($0.05–0.08) + buyer-gate ($0.03) when all enabled",
    },
    agentTrustMeta(allowed ? ["trust_v2_pass"] : ["trust_v2_block"], {
      confidence: 0.9,
      sources: ["pipeline-trust-v2"],
    }),
  );
}
