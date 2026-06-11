/**
 * Partner Registry (Idea 3 — Trust-as-a-Service inside facilitators / wallets).
 *
 * A facilitator, wallet, or marketplace registers as a partner, gets an API key,
 * and embeds the Trust Layer's guard in its own flow. Every guarded payment is
 * counted per partner so revenue-share can be reconciled. One partner deal can
 * route thousands of agents — distribution > direct sign-ups.
 *
 * Storage: JSON under /data (same pattern as escrow-ledger). Keys are random;
 * only a SHA-256 hash of the key is stored, never the raw key.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { constantTimeEqual } from "../protocol/crypto.js";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "partners.json");

/** Rev-share: partners keep this share; the Trust Layer takes the rest. */
const DEFAULT_REVSHARE_PCT = 20; // partner keeps 20% of the per-guard fee
const GUARD_FEE_USDC = 0.05; // notional per-guard fee used for accounting

export type Partner = {
  id: string;
  name: string;
  keyHash: string;
  revsharePct: number;
  guardCalls: number;
  blockedCount: number;
  createdAt: string;
  lastUsedAt: string | null;
};

type Store = Record<string, Partner>;

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function read(): Promise<Store> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Store;
  } catch {
    return {};
  }
}
async function write(store: Store): Promise<void> {
  await writeFile(FILE, JSON.stringify(store, null, 2), "utf8");
}

export type PartnerCreated = { id: string; name: string; apiKey: string; revsharePct: number };

/** Create a partner; returns the raw apiKey ONCE (only its hash is stored). */
export async function createPartner(name: string, revsharePct = DEFAULT_REVSHARE_PCT): Promise<PartnerCreated> {
  const store = await read();
  const id = "ptr_" + randomBytes(6).toString("hex");
  const apiKey = "tlk_" + randomBytes(24).toString("hex");
  store[id] = {
    id,
    name: name.slice(0, 80),
    keyHash: sha256(apiKey),
    revsharePct: Math.max(0, Math.min(80, revsharePct)),
    guardCalls: 0,
    blockedCount: 0,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  await write(store);
  return { id, name: store[id]!.name, apiKey, revsharePct: store[id]!.revsharePct };
}

/** Resolve+authenticate a partner by raw API key (constant-time). */
export async function authenticatePartner(apiKey: string | undefined): Promise<Partner | null> {
  if (!apiKey || !apiKey.startsWith("tlk_")) return null;
  const hash = sha256(apiKey);
  const store = await read();
  for (const p of Object.values(store)) {
    if (constantTimeEqual(p.keyHash, hash)) return p;
  }
  return null;
}

/** Record one guarded call for a partner (for rev-share accounting). */
export async function recordPartnerGuard(id: string, blocked: boolean): Promise<void> {
  const store = await read();
  const p = store[id];
  if (!p) return;
  p.guardCalls += 1;
  if (blocked) p.blockedCount += 1;
  p.lastUsedAt = new Date().toISOString();
  await write(store);
}

export type PartnerUsage = {
  id: string;
  name: string;
  guardCalls: number;
  blockedCount: number;
  revsharePct: number;
  grossUsdc: number;
  partnerShareUsdc: number;
  trustLayerShareUsdc: number;
  lastUsedAt: string | null;
};

export async function getPartnerUsage(id: string): Promise<PartnerUsage | null> {
  const store = await read();
  const p = store[id];
  if (!p) return null;
  const gross = +(p.guardCalls * GUARD_FEE_USDC).toFixed(4);
  const partnerShare = +((gross * p.revsharePct) / 100).toFixed(4);
  return {
    id: p.id,
    name: p.name,
    guardCalls: p.guardCalls,
    blockedCount: p.blockedCount,
    revsharePct: p.revsharePct,
    grossUsdc: gross,
    partnerShareUsdc: partnerShare,
    trustLayerShareUsdc: +(gross - partnerShare).toFixed(4),
    lastUsedAt: p.lastUsedAt,
  };
}
