import { z } from "zod";
import { mergeCompatibleProbeInput } from "./apply-verifier-body.js";
import { VERIFY_EXAMPLES } from "./verify-examples.js";

/** Zod safeParse with canonical VERIFY_EXAMPLES merge (x402gle partial bodies). */
export function parseWithVerifierFallback<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  body: unknown,
): z.SafeParseReturnType<z.infer<T>, z.infer<T>> {
  const ex = VERIFY_EXAMPLES[path];
  const raw =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  if (ex && typeof ex === "object" && !Array.isArray(ex)) {
    return schema.safeParse(mergeCompatibleProbeInput(ex as Record<string, unknown>, raw));
  }

  return schema.safeParse(body);
}
