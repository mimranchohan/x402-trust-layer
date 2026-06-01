import { createHmac, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

export type AgentTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

export type SellerAccessPolicy = {
  requireAttestation: boolean;
  minAgentTier: AgentTier;
  minTrustScore: number;
  minSecurityGrade: "A" | "B" | "C" | "D";
};

export type CertifiedSellerRecord = {
  host: string;
  badgeId: string;
  certifiedAt: string;
  expiresAt: string;
  trustScoreAtCert: number;
  grade: string;
  recommendation: string;
  policy: SellerAccessPolicy;
  goodResponseProfile?: {
    requiredKeys?: string[];
    minLengthBytes?: number;
    forbidEmpty?: boolean;
  };
  /** USDC bond (virtual ledger) — slash on failed delivery claims */
  bondUsdc?: number;
  bondRemainingUsdc?: number;
  signature: string;
};

const root = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(root, "..", "..", "data", "certified-sellers.json");

const TIER_ORDER: AgentTier[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];
const GRADE_ORDER = ["A", "B", "C", "D", "F"] as const;

export function tierMeets(min: AgentTier, actual: AgentTier): boolean {
  return TIER_ORDER.indexOf(actual) >= TIER_ORDER.indexOf(min);
}

export function gradeMeets(min: SellerAccessPolicy["minSecurityGrade"], actual: string): boolean {
  const a = GRADE_ORDER.indexOf(min as (typeof GRADE_ORDER)[number]);
  const b = GRADE_ORDER.indexOf(actual as (typeof GRADE_ORDER)[number]);
  if (a < 0 || b < 0) return false;
  return b <= a;
}

async function loadStore(): Promise<CertifiedSellerRecord[]> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as CertifiedSellerRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveStore(rows: CertifiedSellerRecord[]): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(rows.slice(-200), null, 2), "utf8");
}

function canonical(record: Omit<CertifiedSellerRecord, "signature">): string {
  return JSON.stringify({
    host: record.host,
    badgeId: record.badgeId,
    certifiedAt: record.certifiedAt,
    expiresAt: record.expiresAt,
    trustScoreAtCert: record.trustScoreAtCert,
    policy: record.policy,
    bondRemainingUsdc: record.bondRemainingUsdc ?? 0,
  });
}

function sign(payload: string): string {
  return createHmac("sha256", config.attestationHmacSecret).update(payload).digest("hex");
}

export async function upsertCertification(
  input: Omit<CertifiedSellerRecord, "badgeId" | "certifiedAt" | "expiresAt" | "signature"> & {
    ttlDays?: number;
    bondUsdc?: number;
  },
): Promise<CertifiedSellerRecord> {
  const host = input.host.toLowerCase();
  const badgeId = `cert_${randomBytes(6).toString("hex")}`;
  const certifiedAt = new Date().toISOString();
  const ttlDays = input.ttlDays ?? 30;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60_000).toISOString();
  const bondUsdc = input.bondUsdc ?? 0;
  const base = {
    host,
    badgeId,
    certifiedAt,
    expiresAt,
    trustScoreAtCert: input.trustScoreAtCert,
    grade: input.grade,
    recommendation: input.recommendation,
    policy: input.policy,
    goodResponseProfile: input.goodResponseProfile,
    bondUsdc: bondUsdc > 0 ? bondUsdc : undefined,
    bondRemainingUsdc: bondUsdc > 0 ? bondUsdc : undefined,
  };
  const signature = sign(canonical(base));
  const record: CertifiedSellerRecord = { ...base, signature };
  const rows = await loadStore().then((r) => r.filter((x) => x.host !== host));
  rows.push(record);
  await saveStore(rows);
  return record;
}

export async function getCertifiedHost(host: string): Promise<CertifiedSellerRecord | null> {
  const h = host.toLowerCase();
  const rows = await loadStore();
  const record = rows.find((r) => r.host === h) ?? null;
  if (!record) return null;
  if (new Date(record.expiresAt) < new Date()) return null;
  const expected = sign(
    canonical({
      host: record.host,
      badgeId: record.badgeId,
      certifiedAt: record.certifiedAt,
      expiresAt: record.expiresAt,
      trustScoreAtCert: record.trustScoreAtCert,
      grade: record.grade,
      recommendation: record.recommendation,
      policy: record.policy,
      goodResponseProfile: record.goodResponseProfile,
      bondUsdc: record.bondUsdc,
      bondRemainingUsdc: record.bondRemainingUsdc,
    }),
  );
  if (expected !== record.signature) return null;
  return record;
}

export async function slashSellerBond(
  host: string,
  amountUsdc: number,
  reason: string,
): Promise<{ ok: boolean; host: string; slashedUsdc: number; bondRemainingUsdc: number; reason: string }> {
  const h = host.toLowerCase();
  const rows = await loadStore();
  const idx = rows.findIndex((r) => r.host === h);
  if (idx < 0) {
    return { ok: false, host: h, slashedUsdc: 0, bondRemainingUsdc: 0, reason: "not_certified" };
  }
  const record = rows[idx]!;
  const remaining = Math.max(0, (record.bondRemainingUsdc ?? 0) - amountUsdc);
  const slashed = Math.min(amountUsdc, record.bondRemainingUsdc ?? 0);
  const updated: CertifiedSellerRecord = {
    ...record,
    bondRemainingUsdc: remaining,
    signature: sign(
      canonical({
        ...record,
        bondRemainingUsdc: remaining,
      }),
    ),
  };
  rows[idx] = updated;
  await saveStore(rows);
  return { ok: slashed > 0, host: h, slashedUsdc: slashed, bondRemainingUsdc: remaining, reason };
}

export async function listCertifiedHosts(limit = 50): Promise<CertifiedSellerRecord[]> {
  const now = Date.now();
  const rows = await loadStore();
  return rows
    .filter((r) => new Date(r.expiresAt).getTime() > now)
    .slice(-limit)
    .reverse();
}
