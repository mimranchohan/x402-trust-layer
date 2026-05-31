import { rankFacilitators } from "../lib/facilitators.js";
import { probeEndpoint } from "../lib/probe.js";

export type FailoverInput = {
  targetUrl: string;
  preferNetwork?: string;
  fastProbe?: boolean;
};

export type FailoverResult = {
  targetUrl: string;
  recommendedFacilitator: string;
  facilitators: Awaited<ReturnType<typeof rankFacilitators>>;
  targetProbe: Awaited<ReturnType<typeof probeEndpoint>>;
  routingNote: string;
};

export async function runFacilitatorFailover(input: FailoverInput): Promise<FailoverResult> {
  const facilitators = await rankFacilitators(input.preferNetwork);
  const targetProbe = await probeEndpoint(input.targetUrl, {
    fastSynthetic: input.fastProbe === true,
  });
  const best = facilitators.find((f) => f.healthy) ?? facilitators[0];

  return {
    targetUrl: input.targetUrl,
    recommendedFacilitator: best?.id ?? "dexter",
    facilitators,
    targetProbe,
    routingNote:
      best?.id === "dexter"
        ? "Use Dexter facilitator (https://x402.dexter.cash) for settlement. Client should wrapFetch with facilitatorUrl pointing to the recommended host."
        : `Primary facilitator ${best?.id} is healthy. Fall back to Dexter if settlement fails.`,
  };
}
