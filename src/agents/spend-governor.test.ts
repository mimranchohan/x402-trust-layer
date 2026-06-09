import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSpendGovernor } from "./spend-governor.js";
import type { SpendGovernorInput } from "../types.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../lib/ledger.js", () => ({
  getSpentToday: vi.fn(),
  recordSpend: vi.fn(),
}));

vi.mock("../lib/host-policy.js", () => ({
  hostBlocked: vi.fn(),
  hostAllowed: vi.fn(),
}));

vi.mock("../lib/probe.js", () => ({
  hostOf: vi.fn((url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }),
}));

import { getSpentToday, recordSpend } from "../lib/ledger.js";
import { hostBlocked, hostAllowed } from "../lib/host-policy.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const basePolicy = {
  perCallCapUsdc: 1.0,
  dailyCapUsdc: 10.0,
};

function makeInput(overrides: Partial<SpendGovernorInput> = {}): SpendGovernorInput {
  return {
    agentId: "agent-abc",
    estimatedCostUsdc: 0.10,
    policy: basePolicy,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getSpentToday).mockResolvedValue(0);
  vi.mocked(recordSpend).mockResolvedValue(undefined);
  vi.mocked(hostBlocked).mockReturnValue(false);
  vi.mocked(hostAllowed).mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("runSpendGovernor", () => {
  it("allows a normal spend within all limits", async () => {
    const result = await runSpendGovernor(makeInput());
    expect(result.allowed).toBe(true);
    expect(result.spentTodayUsdc).toBeCloseTo(0.10);
    expect(recordSpend).toHaveBeenCalledWith("agent-abc", 0.10);
  });

  it("blocks when estimated cost exceeds per-call cap", async () => {
    const result = await runSpendGovernor(makeInput({ estimatedCostUsdc: 2.0 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/per-call cap/i);
    expect(recordSpend).not.toHaveBeenCalled();
  });

  it("blocks when spending would exceed daily cap", async () => {
    vi.mocked(getSpentToday).mockResolvedValue(9.95);
    const result = await runSpendGovernor(makeInput({ estimatedCostUsdc: 0.10 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/daily cap/i);
    expect(recordSpend).not.toHaveBeenCalled();
  });

  it("allows spend exactly at daily cap boundary (no overspend)", async () => {
    vi.mocked(getSpentToday).mockResolvedValue(9.90);
    const result = await runSpendGovernor(makeInput({ estimatedCostUsdc: 0.10 }));
    expect(result.allowed).toBe(true);
  });

  it("blocks when target host is in blockedHosts list", async () => {
    vi.mocked(hostBlocked).mockReturnValue(true);
    const result = await runSpendGovernor(
      makeInput({ targetUrl: "https://evil.example.com/api" }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/blocked by policy/i);
    expect(recordSpend).not.toHaveBeenCalled();
  });

  it("blocks when target host is not in allowedHosts list", async () => {
    vi.mocked(hostAllowed).mockReturnValue(false);
    const result = await runSpendGovernor(
      makeInput({
        targetUrl: "https://unlisted.example.com/api",
        policy: { ...basePolicy, allowedHosts: ["approved.example.com"] },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not in allowlist/i);
  });

  it("allows when allowedHosts is empty (no allowlist restriction)", async () => {
    vi.mocked(hostAllowed).mockReturnValue(false); // should not be called
    const result = await runSpendGovernor(
      makeInput({
        targetUrl: "https://anywhere.example.com/api",
        policy: { ...basePolicy, allowedHosts: [] },
      }),
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks when network is not in allowedNetworks", async () => {
    const result = await runSpendGovernor(
      makeInput({
        network: "polygon",
        policy: { ...basePolicy, allowedNetworks: ["solana", "base"] },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not allowed/i);
  });

  it("allows when network matches one entry in allowedNetworks (case-insensitive)", async () => {
    const result = await runSpendGovernor(
      makeInput({
        network: "Base",
        policy: { ...basePolicy, allowedNetworks: ["base"] },
      }),
    );
    expect(result.allowed).toBe(true);
  });

  it("returns correct remainingDailyUsdc after approved spend", async () => {
    vi.mocked(getSpentToday).mockResolvedValue(3.0);
    const result = await runSpendGovernor(makeInput({ estimatedCostUsdc: 0.50 }));
    expect(result.allowed).toBe(true);
    expect(result.remainingDailyUsdc).toBeCloseTo(6.50);
  });
});
