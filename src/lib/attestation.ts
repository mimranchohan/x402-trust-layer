import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { SUITE_VERSION } from "./version.js";
import { db } from "./db.js";

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

export function attestationStorePath(): string {
  const dataDir = process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
  return path.join(dataDir, "attestations.json");
}

const storePath = attestationStorePath();

async function loadStore(): Promise<AttestationRecord[]> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as AttestationRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const upsertAttestation = db.prepare(`
  INSERT INTO attestations (id, agent_id, wallet_address, payload, hmac_signature, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    payload = excluded.payload,
    hmac_signature = excluded.hmac_signature,
    expires_at = excluded.expires_at
`);

async function saveStore(rows: AttestationRecord[]): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(rows.slice(-500), null, 2), "utf8");
  for (const row of rows.slice(-500)) {
    const expiresAt = Math.floor(new Date(row.expiresAt).getTime() / 1000);
    upsertAttestation.run(
      row.attestationId,
      row.agentId,
      row.walletAddress,
      JSON.stringify(row),
      row.signature,
      expiresAt,
    );
  }
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
