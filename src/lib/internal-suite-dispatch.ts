import { config } from "../config.js";
import { mergeCompatibleProbeInput } from "./apply-verifier-body.js";
import { VERIFY_EXAMPLES } from "./verify-examples.js";
import { runPreX402Guard, type PreX402GuardInput } from "../agents/pre-x402-guard.js";

export function isSuiteOrigin(url: string): boolean {
  try {
    return new URL(url).origin === new URL(config.publicBaseUrl).origin;
  } catch {
    return false;
  }
}

/** Paid-route handlers invoked in-process (avoids unpaid 402 on nested suite calls). */
export async function dispatchSuitePost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const example = VERIFY_EXAMPLES[path];
  const merged =
    example && typeof example === "object" && !Array.isArray(example)
      ? mergeCompatibleProbeInput(example as Record<string, unknown>, body)
      : body;

  switch (path) {
    case "/api/guard/pre-x402":
      return runPreX402Guard(merged as PreX402GuardInput);
    default:
      throw new Error(`Internal dispatch not implemented for ${path}`);
  }
}
