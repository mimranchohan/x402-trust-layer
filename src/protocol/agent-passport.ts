import { randomBytes } from "node:crypto";
import { hmacSign, newDid, sha256Hex } from "./crypto.js";
import { readProtocolStore, writeProtocolStore } from "./store.js";

export type AgentPassport = {
  did: string;
  agentId: string;
  publicKey: string;
  ownerIdentity: string;
  capabilities: string[];
  permissions: string[];
  metadata: Record<string, unknown>;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  reputationProfileId: string;
  issuedAt: string;
  credentialType: "AgentPassportVC";
  signature: string;
};

type PassportStore = Record<string, AgentPassport>;

export type IssuePassportInput = {
  agentId: string;
  publicKey?: string;
  ownerIdentity?: string;
  walletAddress?: string;
  capabilities?: string[];
  permissions?: string[];
  metadata?: Record<string, unknown>;
};

export async function issueAgentPassport(input: IssuePassportInput): Promise<AgentPassport> {
  const store = await readProtocolStore<PassportStore>("passports", {});
  const did = newDid(input.agentId);
  const publicKey = input.publicKey ?? sha256Hex(`${input.agentId}:${input.walletAddress ?? "anon"}`);
  const payload = {
    did,
    agentId: input.agentId,
    publicKey,
    ownerIdentity: input.ownerIdentity ?? input.walletAddress ?? "unknown",
    capabilities: input.capabilities ?? ["x402.pay", "x402.preflight", "tool.invoke"],
    permissions: input.permissions ?? ["spend:usdc", "attest:issue"],
    metadata: input.metadata ?? {},
    riskTier: "MEDIUM" as const,
    reputationProfileId: sha256Hex(did).slice(0, 16),
    issuedAt: new Date().toISOString(),
    credentialType: "AgentPassportVC" as const,
  };
  const signature = hmacSign(JSON.stringify(payload));
  const passport: AgentPassport = { ...payload, signature };
  store[did] = passport;
  await writeProtocolStore("passports", store);
  return passport;
}

export async function verifyAgentPassport(did: string): Promise<{
  valid: boolean;
  passport: AgentPassport | null;
  reason?: string;
}> {
  const store = await readProtocolStore<PassportStore>("passports", {});
  const passport = store[did] ?? null;
  if (!passport) return { valid: false, passport: null, reason: "DID not found" };
  const { signature, ...payload } = passport;
  const expected = hmacSign(JSON.stringify(payload));
  if (expected !== signature) {
    return { valid: false, passport, reason: "Invalid credential signature" };
  }
  return { valid: true, passport };
}

export function hardwareAttestationStub(agentId: string): {
  attestationType: "tpm-simulated";
  quote: string;
  agentId: string;
} {
  return {
    attestationType: "tpm-simulated",
    quote: sha256Hex(`tpm:${agentId}:${randomBytes(8).toString("hex")}`),
    agentId,
  };
}
