import { describe, it, expect, vi, beforeEach } from "vitest";
import { runIdentityGate } from "./identity-gate.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../lib/erc8004/trust-score.js", () => ({
  computeTrustScore: vi.fn(),
}));

import { computeTrustScore } from "../lib/erc8004/trust-score.js";

const UNVERIFIED_TRUST = {
  trustScore: 0,
  tier: "UNVERIFIED" as const,
  agentId: null,
  registered: false,
};

beforeEach(() => {
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

  it("rejects address matching blocked pattern 'test'", async () => {
    const result = await runIdentityGate({ walletAddress: "0xtest1234567890abcdef1234567890abcdef1234" });
    expect(result.tier).toBe("restricted");
    expect(result.reasons.some((r) => r.includes("test"))).toBe(true);
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
    vi.mocked(computeTrustScore).mockResolvedValue({
      trustScore: 90,
      tier: "GOLD",
      agentId: "agent-gold-1",
      registered: true,
    });
    const result = await runIdentityGate({ walletAddress: evmAddr });
    expect(result.tier).toBe("trusted");
    expect(result.erc8004?.registered).toBe(true);
    expect(result.erc8004?.tier).toBe("GOLD");
  });

  it("includes ERC-8004 agentId in result when registered", async () => {
    vi.mocked(computeTrustScore).mockResolvedValue({
      trustScore: 85,
      tier: "SILVER",
      agentId: "fleet:agent-42",
      registered: true,
    });
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
    vi.mocked(computeTrustScore).mockResolvedValue({
      trustScore: 95,
      tier: "PLATINUM",
      agentId: "agent-platinum",
      registered: true,
    });
    const result = await runIdentityGate({ walletAddress: evmAddr, maxTierSpendUsdc: 25 });
    expect(result.tier).toBe("trusted");
    expect(result.maxSpendUsdc).toBe(25);
  });

  it("caps standard tier spend at $10 regardless of maxTierSpendUsdc", async () => {
    const result = await runIdentityGate({ walletAddress: evmAddr, maxTierSpendUsdc: 999 });
    expect(result.tier).toBe("standard");
    expect(result.maxSpendUsdc).toBeLessThanOrEqual(10);
  });

  it("sets maxSpendUsdc to 0 for restricted tier", async () => {
    // Force restricted by using an address with a blocked pattern
    const result = await runIdentityGate({
      walletAddress: "0xtest0000000000000000000000000000000000ab",
    });
    expect(result.maxSpendUsdc).toBe(0);
    expect(result.allowed).toBe(false);
  });
});
