import { describe, it, expect, vi, beforeEach } from "vitest";
import { runIdentityGate } from "./identity-gate.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../lib/erc8004/trust-score.js", () => ({
  computeTrustScore: vi.fn(),
}));

import { computeTrustScore } from "../lib/erc8004/trust-score.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const UNVERIFIED_TRUST: any = {
  trustScore: 0,
  tier: "UNVERIFIED" as const,
  agentId: null,
  registered: false,
  walletAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
  chain: null,
  breakdown: {},
  owner: null,
  agentWallet: null,
  agentUri: null,
  reputationCount: 0,
  resolutionSource: "none",
  guidance: null,
  cached: false,
  flags: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(computeTrustScore).mockResolvedValue(UNVERIFIED_TRUST);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("runIdentityGate — address validation", () => {
  it("rejects completely invalid address format", async () => {
    const result = await runIdentityGate({ walletAddress: "notavalidaddress!!" });
    expect(result.allowed).toBe(false);
    expect(result.tier).toBe("restricted");
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/invalid/i)]));
  });

  it("rejects zero EVM address", async () => {
    const result = await runIdentityGate({
      walletAddress: "0x0000000000000000000000000000000000000000",
    });
    expect(result.allowed).toBe(false);
    expect(result.maxSpendUsdc).toBe(0);
  });

  it("rejects address matching blocked pattern (all-ones EVM = BLOCKED_PATTERNS hit)", async () => {
    // "0xtest..." is invalid hex so rejected as bad format before pattern check.
    // Use all-ones EVM address: valid hex, contains "11111111111111111111111111111111" pattern.
    const result = await runIdentityGate({ walletAddress: "0x1111111111111111111111111111111111111111" });
    expect(result.tier).toBe("restricted");
    expect(result.reasons.some((r) => r.includes("pattern"))).toBe(true);
  });

  it("rejects burn address pattern", async () => {
    const result = await runIdentityGate({ walletAddress: "0xburn1234567890abcdef1234567890abcdef1234" });
    expect(result.allowed).toBe(false);
  });
});

describe("runIdentityGate — valid Solana address", () => {
  const solanaAddr = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV1";

  it("allows a valid Solana address", async () => {
    const result = await runIdentityGate({ walletAddress: solanaAddr });
    expect(result.allowed).toBe(true);
    expect(result.tier).not.toBe("restricted");
  });

  it("does NOT call computeTrustScore for Solana addresses (non-EVM)", async () => {
    await runIdentityGate({ walletAddress: solanaAddr });
    expect(computeTrustScore).not.toHaveBeenCalled();
  });

  it("returns standard tier and default maxSpendUsdc for unregistered Solana wallet", async () => {
    const result = await runIdentityGate({ walletAddress: solanaAddr });
    expect(result.tier).toBe("standard");
    expect(result.maxSpendUsdc).toBeLessThanOrEqual(10);
  });
});

describe("runIdentityGate — valid EVM address", () => {
  const evmAddr = "0xabcdef1234567890abcdef1234567890abcdef12";

  it("calls computeTrustScore for EVM addresses", async () => {
    await runIdentityGate({ walletAddress: evmAddr });
    expect(computeTrustScore).toHaveBeenCalledWith({ walletAddress: evmAddr });
  });

  it("upgrades to trusted tier for high-trust ERC-8004 registration", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(computeTrustScore).mockResolvedValue({ trustScore: 90, tier: "GOLD", agentId: "agent-gold-1", registered: true } as any);
    const result = await runIdentityGate({ walletAddress: evmAddr });
    expect(result.tier).toBe("trusted");
    expect(result.erc8004?.registered).toBe(true);
    expect(result.erc8004?.tier).toBe("GOLD");
  });

  it("includes ERC-8004 agentId in result when registered", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(computeTrustScore).mockResolvedValue({ trustScore: 85, tier: "SILVER", agentId: "fleet:agent-42", registered: true } as any);
    const result = await runIdentityGate({ walletAddress: evmAddr });
    expect(result.erc8004?.agentId).toBe("fleet:agent-42");
  });

  it("returns standard tier for unverified EVM address", async () => {
    // Default mock already returns UNVERIFIED
    const result = await runIdentityGate({ walletAddress: evmAddr });
    expect(result.tier).toBe("standard");
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/ERC-8004/i)]),
    );
  });

  it("respects maxTierSpendUsdc cap for trusted tier", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(computeTrustScore).mockResolvedValue({ trustScore: 95, tier: "PLATINUM", agentId: "agent-platinum", registered: true } as any);
    const result = await runIdentityGate({ walletAddress: evmAddr, maxTierSpendUsdc: 25 });
    expect(result.tier).toBe("trusted");
    expect(result.maxSpendUsdc).toBe(25);
  });

  it("caps standard tier spend at $10 regardless of maxTierSpendUsdc", async () => {
    const result = await runIdentityGate({ walletAddress: evmAddr, maxTierSpendUsdc: 999 });
    expect(result.tier).toBe("standard");
    expect(result.maxSpendUsdc).toBeLessThanOrEqual(10);
  });
});
