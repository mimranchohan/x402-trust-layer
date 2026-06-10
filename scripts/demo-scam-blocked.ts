/**
 * Reproducible proof: how the x402 Trust Layer blocks bad payments BEFORE money moves.
 *
 * Runs entirely offline against the suite's own guard logic (URL security + SSRF +
 * spend policy) — no payment, no network. Shows, per scenario, whether an agent's
 * intended payment would be ALLOWED or BLOCKED and how much USDC was saved.
 *
 *   npx tsx scripts/demo-scam-blocked.ts
 */
import { assessUrlSecurity } from "../src/lib/security.js";
import { isSafeOutboundUrl } from "../src/lib/ssrf.js";

type Scenario = {
  label: string;
  url: string;
  estCostUsdc: number;
  policy: { perCallCapUsdc: number; dailyCapUsdc: number; allowedHosts?: string[] };
  spentTodayUsdc: number;
};

const scenarios: Scenario[] = [
  {
    label: "Legit merchant, in policy",
    url: "https://api.realmerchant.com/v1/data",
    estCostUsdc: 0.05,
    policy: { perCallCapUsdc: 1, dailyCapUsdc: 10, allowedHosts: ["api.realmerchant.com"] },
    spentTodayUsdc: 2.0,
  },
  {
    label: "SSRF attack (cloud metadata)",
    url: "http://169.254.169.254/latest/meta-data/iam/credentials",
    estCostUsdc: 0.05,
    policy: { perCallCapUsdc: 1, dailyCapUsdc: 10 },
    spentTodayUsdc: 0,
  },
  {
    label: "Internal/private host exfil",
    url: "http://10.0.0.5:8080/admin",
    estCostUsdc: 0.05,
    policy: { perCallCapUsdc: 1, dailyCapUsdc: 10 },
    spentTodayUsdc: 0,
  },
  {
    label: "Disposable high-risk TLD scam",
    url: "http://free-usdc-airdrop.tk/claim",
    estCostUsdc: 0.5,
    policy: { perCallCapUsdc: 1, dailyCapUsdc: 10 },
    spentTodayUsdc: 0,
  },
  {
    label: "Over per-call budget",
    url: "https://api.realmerchant.com/v1/expensive",
    estCostUsdc: 3.0,
    policy: { perCallCapUsdc: 1, dailyCapUsdc: 10 },
    spentTodayUsdc: 0,
  },
  {
    label: "Would blow daily cap",
    url: "https://api.realmerchant.com/v1/data",
    estCostUsdc: 0.5,
    policy: { perCallCapUsdc: 1, dailyCapUsdc: 10 },
    spentTodayUsdc: 9.8,
  },
];

type Decision = { allowed: boolean; reasons: string[]; grade: string };

function decide(s: Scenario): Decision {
  const reasons: string[] = [];
  const sec = assessUrlSecurity(s.url);

  if (!isSafeOutboundUrl(s.url)) reasons.push("SSRF policy: private/metadata/reserved host");
  if (sec.grade === "F" || sec.grade === "D") reasons.push(`URL security grade ${sec.grade}: ${sec.threats.join("; ")}`);
  if (s.estCostUsdc > s.policy.perCallCapUsdc) reasons.push(`per-call cap exceeded ($${s.estCostUsdc} > $${s.policy.perCallCapUsdc})`);
  if (s.spentTodayUsdc + s.estCostUsdc > s.policy.dailyCapUsdc) reasons.push(`daily cap exceeded ($${(s.spentTodayUsdc + s.estCostUsdc).toFixed(2)} > $${s.policy.dailyCapUsdc})`);
  if (s.policy.allowedHosts) {
    try {
      const host = new URL(s.url).hostname;
      if (!s.policy.allowedHosts.includes(host)) reasons.push(`host not allowlisted: ${host}`);
    } catch { reasons.push("invalid URL"); }
  }
  return { allowed: reasons.length === 0, reasons, grade: sec.grade };
}

let blocked = 0;
let saved = 0;
console.log("\n  x402 Trust Layer — preflight guard proof (offline, no payment)\n");
console.log("  " + "-".repeat(74));
for (const s of scenarios) {
  const d = decide(s);
  const tag = d.allowed ? "ALLOW " : "BLOCK ";
  console.log(`  [${tag}] ${s.label}`);
  console.log(`           ${s.url}`);
  console.log(`           grade=${d.grade}  est=$${s.estCostUsdc.toFixed(2)}`);
  if (!d.allowed) {
    blocked++;
    saved += s.estCostUsdc;
    for (const r of d.reasons) console.log(`           ↳ ${r}`);
  }
  console.log("  " + "-".repeat(74));
}
console.log(`\n  Result: ${blocked}/${scenarios.length} payments blocked before settlement.`);
console.log(`  USDC saved in this run: $${saved.toFixed(2)} (scam + policy violations stopped pre-pay).`);
console.log(`  At fleet scale, each blocked scam = a real loss avoided for a $0.05 guard call.\n`);
