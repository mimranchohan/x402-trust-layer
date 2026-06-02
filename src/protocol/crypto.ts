import { createHash, createHmac, randomBytes } from "node:crypto";
import { config } from "../config.js";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSign(payload: string): string {
  return createHmac("sha256", config.attestationHmacSecret).update(payload).digest("hex");
}

export function verifyHmac(payload: string, signature: string): boolean {
  const expected = hmacSign(payload);
  return expected.length === signature.length && expected === signature;
}

export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("empty");
  let layer = leaves.map((l) => sha256Hex(l));
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left;
      next.push(sha256Hex(`${left}:${right}`));
    }
    layer = next;
  }
  return layer[0]!;
}

export function newDid(agentId: string): string {
  const slug = agentId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 48);
  return `did:agent:${slug}:${randomBytes(8).toString("hex")}`;
}

export function randomNonce(): string {
  return randomBytes(16).toString("hex");
}
