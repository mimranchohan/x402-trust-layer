import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
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
const storePath = path.join(root, "..", "..", "data", "mandates.json");

async function loadStore(): Promise<MandateRecord[]> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as MandateRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveStore(rows: MandateRecord[]): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(rows.slice(-500), null, 2), "utf8");
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
  const rows = await loadStore();
  rows.push(record);
  await saveStore(rows);
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
  const rows = await loadStore();
  const record = rows.find((r) => r.mandateId === mandateId) ?? null;
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
