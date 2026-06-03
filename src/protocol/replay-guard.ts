import { sha256Hex, hmacSign } from "./crypto.js";
import { claimNonceKey, isNonceKeyUsed } from "../lib/nonce-store.js";
import { readProtocolStore, writeProtocolStore } from "./store.js";

async function claimNonceOnce(nonce: string): Promise<boolean> {
  const safe = nonce.replace(/[^a-f0-9]/gi, "").slice(0, 64);
  if (!safe) return false;
  const key = `proto:${safe}`;
  if (isNonceKeyUsed(key)) return false;
  return claimNonceKey(key, "protocol-replay");
}

export type ReplayBindingInput = {
  agentId: string;
  sessionId?: string;
  resourceUrl: string;
  method?: string;
  requestBody?: unknown;
  ttlSeconds?: number;
};

export type ReplayBinding = {
  bindingId: string;
  nonce: string;
  resourceHash: string;
  requestHash: string;
  agentId: string;
  sessionId: string;
  expiresAt: string;
  signature: string;
};

type BindingStore = Record<string, ReplayBinding>;

export async function createReplayBinding(input: ReplayBindingInput): Promise<ReplayBinding> {
  const nonce = sha256Hex(`${Date.now()}:${input.agentId}`).slice(0, 32);
  const resourceHash = sha256Hex(`${input.method ?? "POST"}:${input.resourceUrl}`);
  const requestHash = sha256Hex(JSON.stringify(input.requestBody ?? {}));
  const sessionId = input.sessionId ?? `sess_${input.agentId}`;
  const ttl = input.ttlSeconds ?? 300;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  const bindingId = `rb_${nonce.slice(0, 16)}`;
  const payload = {
    bindingId,
    nonce,
    resourceHash,
    requestHash,
    agentId: input.agentId,
    sessionId,
    expiresAt,
  };
  const signature = hmacSign(JSON.stringify(payload));
  const binding: ReplayBinding = { ...payload, signature };

  const store = await readProtocolStore<BindingStore>("replay-bindings", {});
  store[bindingId] = binding;
  await writeProtocolStore("replay-bindings", store);
  return binding;
}

export async function verifyReplayBinding(
  bindingId: string,
  headers: {
    nonce?: string;
    resourceUrl?: string;
    requestBody?: unknown;
    agentId?: string;
  },
): Promise<{ valid: boolean; reason?: string }> {
  const store = await readProtocolStore<BindingStore>("replay-bindings", {});
  const binding = store[bindingId];
  if (!binding) return { valid: false, reason: "Binding not found" };

  const expected = hmacSign(
    JSON.stringify({
      bindingId: binding.bindingId,
      nonce: binding.nonce,
      resourceHash: binding.resourceHash,
      requestHash: binding.requestHash,
      agentId: binding.agentId,
      sessionId: binding.sessionId,
      expiresAt: binding.expiresAt,
    }),
  );
  if (expected !== binding.signature) return { valid: false, reason: "Binding signature invalid" };

  if (new Date(binding.expiresAt).getTime() < Date.now()) {
    return { valid: false, reason: "Binding expired" };
  }

  if (headers.nonce && headers.nonce !== binding.nonce) {
    return { valid: false, reason: "Nonce mismatch" };
  }

  if (headers.resourceUrl) {
    const rh = sha256Hex(`POST:${headers.resourceUrl}`);
    if (rh !== binding.resourceHash) {
      return { valid: false, reason: "Resource substitution detected" };
    }
  }

  if (headers.requestBody !== undefined) {
    const rq = sha256Hex(JSON.stringify(headers.requestBody));
    if (rq !== binding.requestHash) {
      return { valid: false, reason: "Request body hash mismatch" };
    }
  }

  const claimed = await claimNonceOnce(binding.nonce);
  if (!claimed) return { valid: false, reason: "Nonce already consumed (replay)" };

  return { valid: true };
}
