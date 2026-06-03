import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { db } from "./db.js";
import { SUITE_VERSION } from "./version.js";

export type MandateScope = {
  maxPerTxUsdc: number;
  dailyCapUsdc: number;
  allowedMerchants: string[];
  allowedCategories: string[];
  allowedRails: string[];
  expiresAt: string;
};

export type MandateRecord = {
  mandateId: string;
  issuedAt: string;
  principal: string;
  agentId: string;
  intent: string;
  intentHash: string;
  scope: MandateScope;
  suiteVersion: string;
  signature: string;
};

const root = path.dirname(fileURLToPath(import.meta.url));
const legacyStorePath = path.join(root, "..", "..", "data", "mandates.json");

/** Stable mandate id used by x402gle / Dexter verifier probes (see verify-examples.ts). */
export const VERIFIER_PROBE_MANDATE_ID = "mdt_verifier_probe_example";

type MandateRow = {
  mandate_id: string;
  principal: string;
  agent_id: string;
  intent: string;
  intent_hash: string;
  scope: string;
  signature: string;
  issued_at: string;
  suite_version: string;
};

const selectById = db.prepare("SELECT * FROM mandates WHERE mandate_id = ?");
const selectAll = db.prepare("SELECT * FROM mandates ORDER BY issued_at DESC");
const upsertMandate = db.prepare(`
  INSERT OR REPLACE INTO mandates (
    mandate_id, principal, agent_id, intent, intent_hash, scope, signature,
    issued_at, expires_at, suite_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function rowToRecord(row: MandateRow): MandateRecord {
  return {
    mandateId: row.mandate_id,
    issuedAt: row.issued_at,
    principal: row.principal,
    agentId: row.agent_id,
    intent: row.intent,
    intentHash: row.intent_hash,
    scope: JSON.parse(row.scope) as MandateScope,
    suiteVersion: row.suite_version,
    signature: row.signature,
  };
}

function expiresAtUnix(scope: MandateScope): number | null {
  const t = new Date(scope.expiresAt).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

async function migrateLegacyJsonOnce(): Promise<void> {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM mandates").get() as { c: number }).c;
  if (count > 0) return;
  try {
    const raw = await readFile(legacyStorePath, "utf8");
    const parsed = JSON.parse(raw) as MandateRecord[];
    if (!Array.isArray(parsed)) return;
    for (const r of parsed) {
      upsertMandate.run(
        r.mandateId,
        r.principal,
        r.agentId,
        r.intent,
        r.intentHash,
        JSON.stringify(r.scope),
        r.signature,
        r.issuedAt,
        expiresAtUnix(r.scope),
        r.suiteVersion ?? SUITE_VERSION,
      );
    }
  } catch {
    /* no legacy file */
  }
}

async function loadStore(): Promise<MandateRecord[]> {
  await migrateLegacyJsonOnce();
  return (selectAll.all() as MandateRow[]).map(rowToRecord);
}

async function saveRecord(record: MandateRecord): Promise<void> {
  upsertMandate.run(
    record.mandateId,
    record.principal,
    record.agentId,
    record.intent,
    record.intentHash,
    JSON.stringify(record.scope),
    record.signature,
    record.issuedAt,
    expiresAtUnix(record.scope),
    record.suiteVersion,
  );
}

export function hashIntent(intent: string): string {
  return createHash("sha256").update(intent).digest("hex");
}

function canonical(record: Omit<MandateRecord, "signature" | "suiteVersion">): string {
  return JSON.stringify({
    mandateId: record.mandateId,
    principal: record.principal,
    agentId: record.agentId,
    intentHash: record.intentHash,
    scope: record.scope,
  });
}

function sign(payload: string): string {
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

export async function issueMandate(input: {
  principal: string;
  agentId: string;
  intent: string;
  scope: MandateScope;
}): Promise<MandateRecord> {
  const mandateId = `mdt_${randomBytes(8).toString("hex")}`;
  const issuedAt = new Date().toISOString();
  const intentHash = hashIntent(input.intent);
  const base = {
    mandateId,
    issuedAt,
    principal: input.principal,
    agentId: input.agentId,
    intent: input.intent,
    intentHash,
    scope: input.scope,
  };
  const signature = sign(canonical(base));
  const record: MandateRecord = { ...base, suiteVersion: SUITE_VERSION, signature };
  await saveRecord(record);
  return record;
}

/** Seed a signed probe mandate so /api/mandate/verify passes x402gle audits. */
export async function ensureVerifierProbeMandate(): Promise<MandateRecord> {
  const existing = selectById.get(VERIFIER_PROBE_MANDATE_ID) as MandateRow | undefined;
  if (existing) return rowToRecord(existing);

  const intent = "Buy ETH/USD oracle data for a trading bot, under $1 per call, daily $10 cap";
  const scope: MandateScope = {
    maxPerTxUsdc: 0.5,
    dailyCapUsdc: 10,
    allowedMerchants: ["myceliasignal.com", "dexter.cash", "api.myceliasignal.com"],
    allowedCategories: ["market-data", "oracle"],
    allowedRails: ["base-x402", "solana-x402", "visa-cli"],
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString(),
  };
  const issuedAt = new Date().toISOString();
  const intentHash = hashIntent(intent);
  const base = {
    mandateId: VERIFIER_PROBE_MANDATE_ID,
    issuedAt,
    principal: "cardholder:dexter-verifier",
    agentId: "dexter-verifier-probe",
    intent,
    intentHash,
    scope,
  };
  const signature = sign(canonical(base));
  const record: MandateRecord = { ...base, suiteVersion: SUITE_VERSION, signature };
  await saveRecord(record);
  return record;
}

export type MandateCheck = {
  amountUsdc: number;
  merchant?: string;
  category?: string;
  rail?: string;
};

export type MandateVerifyResult = {
  valid: boolean;
  withinScope: boolean;
  reason: string;
  record: MandateRecord | null;
  violations: string[];
};

export async function verifyMandate(
  mandateId: string,
  proposed?: MandateCheck,
): Promise<MandateVerifyResult> {
  if (mandateId === VERIFIER_PROBE_MANDATE_ID) {
    await ensureVerifierProbeMandate();
  }
  await migrateLegacyJsonOnce();
  const row = selectById.get(mandateId) as MandateRow | undefined;
  const record = row ? rowToRecord(row) : null;
  if (!record) {
    return { valid: false, withinScope: false, reason: "Mandate not found", record: null, violations: ["not_found"] };
  }
  const expected = sign(
    canonical({
      mandateId: record.mandateId,
      issuedAt: record.issuedAt,
      principal: record.principal,
      agentId: record.agentId,
      intent: record.intent,
      intentHash: record.intentHash,
      scope: record.scope,
    }),
  );
  if (!signaturesEqual(expected, record.signature)) {
    return { valid: false, withinScope: false, reason: "Signature mismatch (tampered)", record, violations: ["signature"] };
  }
  if (new Date(record.scope.expiresAt) < new Date()) {
    return { valid: true, withinScope: false, reason: "Mandate expired", record, violations: ["expired"] };
  }
  const violations: string[] = [];
  if (proposed) {
    if (proposed.amountUsdc > record.scope.maxPerTxUsdc) {
      violations.push(`amount ${proposed.amountUsdc} exceeds maxPerTxUsdc ${record.scope.maxPerTxUsdc}`);
    }
    if (
      proposed.merchant &&
      record.scope.allowedMerchants.length > 0 &&
      !record.scope.allowedMerchants.some((m) => proposed.merchant!.toLowerCase().includes(m.toLowerCase()))
    ) {
      violations.push(`merchant ${proposed.merchant} not in allowedMerchants`);
    }
    if (
      proposed.category &&
      record.scope.allowedCategories.length > 0 &&
      !record.scope.allowedCategories.includes(proposed.category)
    ) {
      violations.push(`category ${proposed.category} not in allowedCategories`);
    }
    if (
      proposed.rail &&
      record.scope.allowedRails.length > 0 &&
      !record.scope.allowedRails.includes(proposed.rail)
    ) {
      violations.push(`rail ${proposed.rail} not in allowedRails`);
    }
  }
  const withinScope = violations.length === 0;
  return {
    valid: true,
    withinScope,
    reason: withinScope ? "Valid mandate, proposed payment within scope" : "Valid signature but proposed payment violates scope",
    record,
    violations,
  };
}
