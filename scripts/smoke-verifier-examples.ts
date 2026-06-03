/**
 * Ensures every VERIFY_EXAMPLES entry parses (x402gle partial-body merge path).
 * Usage: npx tsx scripts/smoke-verifier-examples.ts
 */
import { z } from "zod";
import { VERIFY_EXAMPLES } from "../src/lib/verify-examples.js";
import { mergeCompatibleProbeInput } from "../src/lib/apply-verifier-body.js";
import { parseWithVerifierFallback } from "../src/lib/parse-with-verifier-fallback.js";

const guardBodySchema = z.object({
  agentId: z.string().min(1),
  walletAddress: z.string().min(16),
  targetUrl: z.string().url(),
  estimatedCostUsdc: z.coerce.number().nonnegative(),
  network: z.string().optional(),
  policy: z
    .object({
      dailyCapUsdc: z.coerce.number().positive(),
      perCallCapUsdc: z.coerce.number().positive(),
      allowedHosts: z.array(z.string()).optional(),
    })
    .optional(),
});

const schemas: Record<string, z.ZodTypeAny> = {
  "/api/guard/pre-x402": guardBodySchema,
  "/api/x402/proxy": guardBodySchema.extend({ issueAttestation: z.coerce.boolean().optional() }),
  "/api/pipeline/execute": guardBodySchema.extend({
    task: z.string().min(3).optional(),
    maxBudgetUsdc: z.coerce.number().positive().optional(),
    marketplaceQuery: z.string().min(2).optional(),
  }),
  "/api/router/route": z.object({
    query: z.string().min(2),
    preferNetwork: z.string().optional(),
    maxPriceUsdc: z.coerce.number().optional(),
    skipProbes: z.coerce.boolean().optional(),
  }),
  "/api/mpp/session": z.object({
    action: z.enum(["open", "voucher", "close", "status"]),
    expectedCalls: z.coerce.number().int().positive().optional(),
    avgPricePerCallUsdc: z.coerce.number().positive().optional(),
    chain: z.string().optional(),
    agentId: z.string().optional(),
  }),
  "/api/seller/audition-coach": z.object({
    origin: z.string().optional(),
    maxRoutes: z.coerce.number().int().min(1).max(30).optional(),
  }),
  "/api/a2a/execute": z.object({
    buyerAgentId: z.string().min(1),
    sellerAgentId: z.string().min(1),
    sellerEndpoint: z.string().url(),
    taskDescription: z.string().min(1).max(4000),
    maxBudgetUsdc: z.number().positive().max(10),
  }),
  "/api/protocol/passport/verify": z.object({ did: z.string().min(10) }),
  "/api/protocol/execution/verify": z.object({ receiptId: z.string().min(8) }),
};

let failed = 0;

for (const path of Object.keys(VERIFY_EXAMPLES)) {
  const schema = schemas[path];
  if (!schema) continue;

  const empty = parseWithVerifierFallback(path, schema, {});
  const partial = parseWithVerifierFallback(path, schema, { agentId: "x" });
  if (!empty.success) {
    console.error(`FAIL ${path} empty merge:`, empty.error.flatten());
    failed++;
    continue;
  }
  if (!partial.success) {
    console.error(`FAIL ${path} partial merge:`, partial.error.flatten());
    failed++;
    continue;
  }
  const ex = VERIFY_EXAMPLES[path] as Record<string, unknown>;
  const merged = mergeCompatibleProbeInput(ex, {});
  if (Object.keys(merged).length < 1) {
    console.error(`FAIL ${path} merge empty`);
    failed++;
    continue;
  }
  console.log(`ok ${path}`);
}

if (failed > 0) {
  console.error(`\n${failed} verifier example smoke failure(s)`);
  process.exit(1);
}
console.log(`\nAll ${Object.keys(schemas).length} schema-mapped verifier paths OK`);
