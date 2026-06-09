import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (before imports) ────────────────────────────────────────────────────

vi.mock("../lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/security.js", () => ({
  assessUrlSecurity: vi.fn().mockReturnValue({ grade: "A", score: 90, threats: [], recommendations: [] }),
  mergeSecurityIntoRisk: vi.fn().mockReturnValue({ riskScore: 0, securityGrade: "A", combinedThreats: [] }),
}));

vi.mock("../lib/verifier-fast-path.js", () => ({
  isVerifierAgentId: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/erc8004/trust-score.js", () => ({
  computeTrustScore: vi.fn().mockResolvedValue({
    walletAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
    tier: "GOLD",
    trustScore: 72,
    registered: true,
    agentId: "1",
    chain: { chainId: 8453, name: "base-mainnet" },
    breakdown: { onChainRegistration: 30, reputation: 25, walletVerified: 15, agentCard: 0, domainWellKnown: 0, paymentHistory: 0 },
    owner: null,
    agentWallet: null,
    agentUri: null,
    reputationCount: 0,
    resolutionSource: "alchemy",
    guidance: null,
    cached: false,
    flags: [],
  }),
  meetsMinTier: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/erc8004/constants.js", () => ({
  isEvmAddress: vi.fn().mockReturnValue(true),
}));

vi.mock("./spend-governor.js", () => ({
  runSpendGovernor: vi.fn().mockResolvedValue({
    allowed: true,
    reason: "ok",
    spentTodayUsdc: 0,
    remainingDailyUsdc: 100,
    perCallCapUsdc: 1,
  }),
}));

vi.mock("./risk-gate.js", () => ({
  runRiskGate: vi.fn().mockResolvedValue({
    safe: true,
    riskScore: 5,
    securityGrade: "A",
    reasons: [],
  }),
}));

vi.mock("./identity-gate.js", () => ({
  runIdentityGate: vi.fn().mockResolvedValue({
    allowed: true,
    tier: "GOLD",
    trustScore: 72,
    reasons: [],
  }),
}));

vi.mock("../lib/agent-response.js", () => ({
  // Real withAgentTrust spreads meta fields (confidence, checks_passed, sources, accuracy_note)
  // onto the payload — it does NOT create an `agentTrust` key. The payload's own
  // `agentTrust` field (null or object) is preserved through the spread.
  withAgentTrust: vi.fn((payload: unknown, meta: unknown) => ({
    ...(payload as object),
    ...(meta as object),
  })),
  agentTrustMeta: vi.fn((_checks: unknown, _opts?: unknown) => ({
    confidence: 0.86,
    checks_passed: [],
    sources: [],
    accuracy_note: "mock",
  })),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { runPreX402Guard } from "./pre-x402-guard.js";
import { runSpendGovernor } from "./spend-governor.js";
import { runRiskGate } from "./risk-gate.js";
import { runIdentityGate } from "./identity-gate.js";
import { computeTrustScore } from "../lib/erc8004/trust-score.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_WALLET = "0xabcdef1234567890abcdef1234567890abcdef12";

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "agent-1",
    walletAddress: VALID_WALLET,
    targetUrl: "https://api.example.com/data",
    estimatedCostUsdc: 0.01,
    policy: {
      dailyCapUsdc: 10,
      perCallCapUsdc: 1,
    },
    ...overrides,
  };
}

// Default mock return values — reused in beforeEach to reset after timeout test
const DEFAULT_SPEND = { allowed: true, reason: "ok", spentTodayUsdc: 0, remainingDailyUsdc: 100, perCallCapUsdc: 1 };
const DEFAULT_RISK  = { safe: true, riskScore: 5, securityGrade: "A", reasons: [] };
const DEFAULT_IDENTITY = { allowed: true, tier: "GOLD", trustScore: 72, reasons: [] };

// ─────────────────────────────────────────────────────────────────────────────

describe("runPreX402Guard", () => {
  beforeEach(() => {
    // clearAllMocks resets call history only — implementations survive.
    // The timeout test restores runSpendGovernor inline so subsequent tests
    // don't inherit the hanging Promise.
    vi.clearAllMocks();
    (runSpendGovernor as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_SPEND);
    (runRiskGate      as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_RISK);
    (runIdentityGate  as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_IDENTITY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns allowed=true when all gates pass", async () => {
    const result = await runPreX402Guard(makeInput());

    expect(result.allowed).toBe(true);
    expect(result.summary).toMatch(/safe to proceed/i);
    expect(runSpendGovernor).toHaveBeenCalledOnce();
    expect(runRiskGate).toHaveBeenCalledOnce();
    expect(runIdentityGate).toHaveBeenCalledOnce();
  });

  // ── computeTrustScore NOT called without minAgentTier/minTrustScore ─────────

  it("does not call computeTrustScore when no tier/score constraints given", async () => {
    await runPreX402Guard(makeInput());
    expect(computeTrustScore).not.toHaveBeenCalled();
  });

  // ── computeTrustScore IS called when minAgentTier given ─────────────────────

  it("calls computeTrustScore when minAgentTier is provided", async () => {
    await runPreX402Guard(makeInput({ minAgentTier: "SILVER" }));
    expect(computeTrustScore).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: VALID_WALLET }),
    );
  });

  // ── Spend governor blocks ───────────────────────────────────────────────────

  it("returns allowed=false when spend governor blocks", async () => {
    (runSpendGovernor as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      reason: "daily_cap_exceeded",
      spentTodayUsdc: 10,
      remainingDailyUsdc: 0,
      perCallCapUsdc: 1,
    });

    const result = await runPreX402Guard(makeInput());

    expect(result.allowed).toBe(false);
    expect(result.summary).toContain("spend:");
    expect(result.summary).toContain("daily_cap_exceeded");
  });

  // ── Risk gate blocks ────────────────────────────────────────────────────────

  it("returns allowed=false when risk gate reports unsafe", async () => {
    (runRiskGate as ReturnType<typeof vi.fn>).mockResolvedValue({
      safe: false,
      riskScore: 80,
      securityGrade: "D",
      reasons: ["blocked_host"],
    });

    const result = await runPreX402Guard(makeInput());

    expect(result.allowed).toBe(false);
    expect(result.summary).toContain("risk:");
  });

  // ── Identity gate blocks ────────────────────────────────────────────────────

  it("returns allowed=false when identity gate blocks", async () => {
    (runIdentityGate as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      tier: "UNVERIFIED",
      trustScore: 0,
      reasons: ["tier_too_low"],
    });

    const result = await runPreX402Guard(makeInput());

    expect(result.allowed).toBe(false);
    expect(result.summary).toContain("identity:");
    expect(result.summary).toContain("tier_too_low");
  });

  // ── Hard timeout — rejects with error (loud fail) ───────────────────────────

  it("rejects with descriptive error when guard times out", async () => {
    vi.useFakeTimers();

    // Make spend governor hang forever
    (runSpendGovernor as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const guardPromise = runPreX402Guard(makeInput());

    // Attach the rejection handler BEFORE advancing fake timers.
    // Without this, guardPromise rejects inside advanceTimersByTimeAsync and
    // vitest flags it as an unhandled rejection (no .catch attached yet).
    const assertion = expect(guardPromise).rejects.toThrow(
      /pre-x402-guard timed out after 12000ms/i,
    );

    // Advance past the 12 000 ms default GUARD_TIMEOUT_MS
    await vi.advanceTimersByTimeAsync(13_000);
    await assertion;

    // Restore real timers + default mock so subsequent tests don't inherit the hanging Promise
    vi.useRealTimers();
    (runSpendGovernor as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_SPEND);
  });

  // ── agentTrust attached to result ───────────────────────────────────────────

  it("attaches agentTrust to result when minAgentTier is provided", async () => {
    const result = await runPreX402Guard(makeInput({ minAgentTier: "BRONZE" }));

    expect(result).toHaveProperty("agentTrust");
    expect(result.agentTrust).toMatchObject({ tier: "GOLD", trustScore: 72 });
  });

  it("agentTrust is null when no tier/score constraint given", async () => {
    const result = await runPreX402Guard(makeInput());
    expect(result.agentTrust).toBeNull();
  });

  // ── Multiple blockers accumulate ────────────────────────────────────────────

  it("accumulates multiple blockers in summary", async () => {
    (runSpendGovernor as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      reason: "daily_cap_exceeded",
      spentTodayUsdc: 10,
      remainingDailyUsdc: 0,
      perCallCapUsdc: 1,
    });
    (runIdentityGate as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      tier: "UNVERIFIED",
      trustScore: 0,
      reasons: ["no_identity"],
    });

    const result = await runPreX402Guard(makeInput());

    expect(result.allowed).toBe(false);
    expect(result.summary).toContain("spend:");
    expect(result.summary).toContain("identity:");
  });
});
