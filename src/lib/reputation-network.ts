/**
 * Reputation Data Network (Idea 1 — "the Experian / Chainalysis of agents").
 *
 * Every guard / KYM / fraud / settlement observation can be recorded here, keyed
 * by subject (a wallet address or a merchant host). Over time this becomes a
 * reputation graph that any agent, wallet, facilitator, or marketplace can query.
 *
 * Storage: append-only-ish JSON file under /data (same pattern as escrow-ledger).
 * The aggregated score is computed on read, so weighting can evolve without a
 * migration. Source of truth for high-stakes trust remains on-chain (ERC-8004);
 * this is a fast, cross-protocol reputation accelerator.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "reputation-network.json");

export type ReputationSignal =
  | "guard_pass"
  | "guard_block"
  | "kym_pay"
  | "kym_caution"
  | "kym_avoid"
  | "fraud_clean"
  | "fraud_flag"
  | "settlement_ok"
  | "settlement_fail"
  | "delivery_good"
  | "delivery_bad";

const SIGNAL_WEIGHT: Record<ReputationSignal, number> = {
  guard_pass: +2,
  guard_block: -6,
  kym_pay: +3,
  kym_caution: -2,
  kym_avoid: -8,
  fraud_clean: +2,
  fraud_flag: -10,
  settlement_ok: +2,
  settlement_fail: -3,
  delivery_good: +3,
  delivery_bad: -5,
};

export type SubjectKind = "wallet" | "host";

type SubjectRecord = {
  subject: string;
  kind: SubjectKind;
  counts: Partial<Record<ReputationSignal, number>>;
  firstSeen: string;
  lastSeen: string;
  reporters: string[]; // partner ids / sources that contributed (deduped)
};

type Store = Record<string, SubjectRecord>;

function normalizeSubject(subject: string): string {
  const s = subject.trim();
  return s.startsWith("0x") ? s.toLowerCase() : s.toLowerCase();
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

export type ReputationTier = "TRUSTED" | "NEUTRAL" | "WATCH" | "HIGH_RISK" | "UNKNOWN";

export type ReputationResult = {
  subject: string;
  kind: SubjectKind;
  score: number; // 0..100 (50 = neutral / no data)
  tier: ReputationTier;
  observations: number;
  signals: Partial<Record<ReputationSignal, number>>;
  reporters: number;
  firstSeen: string | null;
  lastSeen: string | null;
  note: string;
};

function scoreFrom(rec: SubjectRecord | undefined): { score: number; obs: number } {
  if (!rec) return { score: 50, obs: 0 };
  let raw = 0;
  let obs = 0;
  for (const [sig, n] of Object.entries(rec.counts) as [ReputationSignal, number][]) {
    raw += (SIGNAL_WEIGHT[sig] ?? 0) * n;
    obs += n;
  }
  // Squash raw into 0..100 around a neutral 50, with diminishing effect.
  const score = Math.max(0, Math.min(100, Math.round(50 + 50 * Math.tanh(raw / 40))));
  return { score, obs };
}

function tierFor(score: number, obs: number): ReputationTier {
  if (obs === 0) return "UNKNOWN";
  if (score >= 75) return "TRUSTED";
  if (score >= 55) return "NEUTRAL";
  if (score >= 35) return "WATCH";
  return "HIGH_RISK";
}

/** Record one observation about a subject. Safe to call fire-and-forget. */
export async function recordObservation(
  subjectRaw: string,
  kind: SubjectKind,
  signal: ReputationSignal,
  reporter = "self",
): Promise<void> {
  const subject = normalizeSubject(subjectRaw);
  if (!subject) return;
  const store = await read();
  const now = new Date().toISOString();
  const rec = store[subject] ?? {
    subject,
    kind,
    counts: {},
    firstSeen: now,
    lastSeen: now,
    reporters: [],
  };
  rec.counts[signal] = (rec.counts[signal] ?? 0) + 1;
  rec.lastSeen = now;
  if (reporter && !rec.reporters.includes(reporter)) rec.reporters.push(reporter);
  store[subject] = rec;
  await write(store);
}

export async function getReputation(subjectRaw: string): Promise<ReputationResult> {
  const subject = normalizeSubject(subjectRaw);
  const store = await read();
  const rec = store[subject];
  const { score, obs } = scoreFrom(rec);
  const tier = tierFor(score, obs);
  return {
    subject,
    kind: rec?.kind ?? (subject.startsWith("0x") ? "wallet" : "host"),
    score,
    tier,
    observations: obs,
    signals: rec?.counts ?? {},
    reporters: rec?.reporters.length ?? 0,
    firstSeen: rec?.firstSeen ?? null,
    lastSeen: rec?.lastSeen ?? null,
    note:
      obs === 0
        ? "No observations yet — neutral by default. Reputation builds as the network reports."
        : "Aggregated across all network reporters. Not a guarantee; use as one trust signal.",
  };
}

/** Network-wide stats + worst offenders, for the public reputation page / data feed. */
export async function reputationStats(limit = 20): Promise<{
  totalSubjects: number;
  totalObservations: number;
  highRisk: ReputationResult[];
}> {
  const store = await read();
  const all = Object.values(store);
  let totalObs = 0;
  const scored = all.map((rec) => {
    const { score, obs } = scoreFrom(rec);
    totalObs += obs;
    return { rec, score, obs };
  });
  const highRisk = scored
    .filter((x) => x.obs > 0 && x.score < 35)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ rec, score, obs }) => ({
      subject: rec.subject,
      kind: rec.kind,
      score,
      tier: tierFor(score, obs),
      observations: obs,
      signals: rec.counts,
      reporters: rec.reporters.length,
      firstSeen: rec.firstSeen,
      lastSeen: rec.lastSeen,
      note: "High-risk subject flagged by the reputation network.",
    }));
  return { totalSubjects: all.length, totalObservations: totalObs, highRisk };
}
