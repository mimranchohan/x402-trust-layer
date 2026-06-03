/**
 * Every VERIFY_EXAMPLES path: empty + partial body must merge (x402gle grader path).
 */
import { z } from "zod";
import { VERIFY_EXAMPLES } from "../src/lib/verify-examples.js";
import { mergeCompatibleProbeInput } from "../src/lib/apply-verifier-body.js";
import { parseWithVerifierFallback } from "../src/lib/parse-with-verifier-fallback.js";

const loose = z.record(z.unknown());

let failed = 0;
const paths = Object.keys(VERIFY_EXAMPLES).sort();

for (const path of paths) {
  const ex = VERIFY_EXAMPLES[path] as Record<string, unknown>;
  const merged = mergeCompatibleProbeInput(ex, {});
  if (Object.keys(merged).length < 1) {
    console.error(`FAIL ${path}: merge produced empty object`);
    failed++;
    continue;
  }
  const empty = parseWithVerifierFallback(path, loose, {});
  const partial = parseWithVerifierFallback(path, loose, { agentId: "probe" });
  if (!empty.success || !partial.success) {
    console.error(`FAIL ${path}: parse`, empty.success ? partial.error : empty.error);
    failed++;
    continue;
  }
  console.log(`ok ${path}`);
}

if (failed > 0) {
  console.error(`\n${failed} failure(s) of ${paths.length}`);
  process.exit(1);
}
console.log(`\nAll ${paths.length} VERIFY_EXAMPLES paths OK`);
