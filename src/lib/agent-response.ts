/** Standard trust fields on paid agent responses (Dexter / fleet integrators). */
export type AgentTrustMeta = {
  confidence: number;
  checks_passed: string[];
  sources: string[];
  accuracy_note: string;
};

export type WithAgentTrust<T> = T & AgentTrustMeta;

const DEFAULT_NOTE =
  "Heuristic preflight only — not 100% accurate; not a guarantee of downstream API quality, merchant honesty, or settlement success.";

export function agentTrustMeta(
  checks_passed: string[],
  options?: { confidence?: number; sources?: string[]; accuracy_note?: string },
): AgentTrustMeta {
  const confidence = Math.max(0, Math.min(1, options?.confidence ?? 0.82));
  return {
    confidence,
    checks_passed,
    sources: options?.sources ?? ["x402-agent-suite-pro", "dexter-facilitator"],
    accuracy_note: options?.accuracy_note ?? DEFAULT_NOTE,
  };
}

export function withAgentTrust<T extends Record<string, unknown>>(
  payload: T,
  meta: AgentTrustMeta,
): T & AgentTrustMeta {
  return { ...payload, ...meta };
}
