import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { SUITE_VERSION } from "./version.js";

export type AttestationRecord = {
  attestationId: string;
  issuedAt: string;
  expiresAt: string;
  agentId: string;
  walletAddress: string;
  targetUrl: string;
  network: string;
  allowed: boolean;
  securityGrade: string;
  riskScore: number;
  suiteVersion: string;
  signature: string;
};

const root = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(root, "..", "..", "data", "attestations.json");

async function loadStore(): Promise<AttestationRecord[]> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as AttestationRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveStore(rows: AttestationRecord[]): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(rows.slice(-500), null, 2), "utf8");
}

function signPayload(payload: string): string {
  return createHmac("sha256", config.attestationHmacSecret).update(payload).digest("hex");
}

function signaturesEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export async function issueAttestation(input: {
  agentId: string;
  walletAddress: string;
  targetUrl: string;
  network: string;
  allowed: boolean;
  securityGrade: string;
  riskScore: number;
  ttlMinutes?: number;
}): Promise<AttestationRecord> {
  const ttl = input.ttlMinutes ?? 15;
  const now = new Date();
  const expires = new Date(now.getTime() + ttl * 60_000);
  const attestationId = `att_${randomBytes(8).toString("hex")}`;
  const payload = JSON.stringify({
    attestationId,
    agentId: input.agentId,
    targetUrl: input.targetUrl,
    allowed: input.allowed,
    expiresAt: expires.toISOString(),
  });
  const signature = signPayload(payload);

  const record: AttestationRecord = {
    attestationId,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    agentId: input.agentId,
    walletAddress: input.walletAddress,
    targetUrl: input.targetUrl,
    network: input.network,
    allowed: input.allowed,
    securityGrade: input.securityGrade,
    riskScore: input.riskScore,
    suiteVersion: SUITE_VERSION,
    signature,
  };

  const rows = await loadStore();
  rows.push(record);
  await saveStore(rows);
  return record;
}

export async function verifyAttestation(
  attestationId: string,
): Promise<{ valid: boolean; record: AttestationRecord | null; reason: string }> {
  const rows = await loadStore();
  const record = rows.find((r) => r.attestationId === attestationId) ?? null;
  if (!record) return { valid: false, record: null, reason: "Attestation not found" };
  if (new Date(record.expiresAt) < new Date()) {
    return { valid: false, record, reason: "Attestation expired" };
  }
  const payload = JSON.stringify({
    attestationId: record.attestationId,
    agentId: record.agentId,
    targetUrl: record.targetUrl,
    allowed: record.allowed,
    expiresAt: record.expiresAt,
  });
  const expected = signPayload(payload);
  if (!signaturesEqual(expected, record.signature)) {
    return { valid: false, record, reason: "Signature mismatch" };
  }
  if (!record.allowed) return { valid: false, record, reason: "Preflight was denied" };
  return { valid: true, record, reason: "Valid attestation" };
}
