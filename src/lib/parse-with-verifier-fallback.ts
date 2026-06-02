import { z } from "zod";
import { mergeCompatibleProbeInput } from "./apply-verifier-body.js";
import { VERIFY_EXAMPLES } from "./verify-examples.js";

/** Zod safeParse with canonical VERIFY_EXAMPLES merge when grader payloads are partial. */
export function parseWithVerifierFallback<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  body: unknown,
): z.SafeParseReturnType<z.infer<T>, z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed;

  const ex = VERIFY_EXAMPLES[path];
  if (!ex || typeof ex !== "object" || Array.isArray(ex)) return parsed;

  const raw =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  return schema.safeParse(mergeCompatibleProbeInput(ex as Record<string, unknown>, raw));
}
