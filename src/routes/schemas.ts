import { z } from "zod";
import { VERIFY_EXAMPLES } from "../lib/verify-examples.js";

export const hostListSchema = z.preprocess((val) => {
  if (!Array.isArray(val)) return val;
  return val.map((h) => {
    if (typeof h === "string") return h;
    if (h && typeof h === "object" && "host" in h && typeof (h as { host: string }).host === "string") {
      return (h as { host: string }).host;
    }
    return String(h);
  });
}, z.array(z.string()));

export const policySchema = z.object({
  dailyCapUsdc: z.coerce.number().positive(),
  perCallCapUsdc: z.coerce.number().positive(),
  allowedHosts: hostListSchema.optional(),
  blockedHosts: hostListSchema.optional(),
  allowedNetworks: z.array(z.string()).optional(),
});

export const guardBodySchema = z.object({
  agentId: z.string().min(1),
  walletAddress: z.string().min(16),
  targetUrl: z.string().url(),
  estimatedCostUsdc: z.coerce.number().nonnegative(),
  network: z.string().optional(),
  policy: policySchema,
  maxTierSpendUsdc: z.number().optional(),
  minAgentTier: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]).optional(),
  minTrustScore: z.number().min(0).max(100).optional(),
});

export function verifierFallback(path: string): Record<string, unknown> | null {
  const ex = VERIFY_EXAMPLES[path];
  if (!ex || typeof ex !== "object" || Array.isArray(ex)) return null;
  return ex as Record<string, unknown>;
}
