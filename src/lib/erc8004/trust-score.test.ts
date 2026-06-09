import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (must be before import of module under test) ───────────────────────

vi.mock("../../config.js", () => ({
  config: { trustScoreCacheTtlSec: 60, alchemyApiKey: "" },
}));

vi.mock("../logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("./cache.js", () => ({
  cacheGet: vi.fn().mockReturnValue(null),
  cacheSet: vi.fn(),
  cacheKey: vi.fn((...args: unknown[]) => args.flat().join(":")),
}));

vi.mock("./registry.js", () => ({
  chainMeta: vi.fn(() => ({ chainId: 8453, name: "base-mainnet" })),
  readOwnerOf: vi.fn().mockResolvedValue(null),
  readAgentWallet: vi.fn().mockResolvedValue(null),
  readReputationSummary: vi.fn().mockResolvedValue(null),
  readTokenUri: vi.fn().mockResolvedValue(null),
}));

vi.mock("./resolve-agent.js", () => ({
  resolveAgentId: vi.fn().mockResolvedValue({
    agentId: null,
    source: "none",
    guidance: "No ERC-8004 token found",
  }),
}));

vi.mock("./agent-card.js", () => ({
  fetchAgentCard: vi.fn().mockResolvedValue(null),
  scoreAgentCard: vi.fn().mockReturnValue({ points: 0, valid: false, domain: null }),
  verifyWellKnown: vi.fn().mockResolvedValue({ points: 0, verified: false }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { computeTrustScore, meetsMinTier } from "./trust-score.js";
import { cacheGet, cacheSet } from "./cache.js";
import { resolveAgentId } from "./resolve-agent.js";
import { logger } from "../logger.js";

// ─────────────────────────────────────────────────────────────────────────────

const VALID_WALLET = "0xabcdef1234567890abcdef1234567890abcdef12";
const INVALID_WALLET = "not-a-wallet";

describe("computeTrustScore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Invalid wallet ──────────────────────────────────────────────────────────

  it("returns UNKNOWN for an invalid wallet address", async () => {
    const result = await computeTrustScore({ walletAddress: INVALID_WALLET });

    expect(result.tier).toBe("UNKNOWN");
    expect(result.trustScore).toBe(0);
    expect(result.flags).toContain("invalid_wallet");
    expect(result.guidance).toMatch(/invalid/i);
    expect(result.registered).toBe(false);
    expect(cacheSet).not.toHaveBeenCalled();
  });

  // ── Cache hit ───────────────────────────────────────────────────────────────

  it("returns cached result with cached=true", async () => {
    const cached = {
      walletAddress: VALID_WALLET,
      agentId: null,
      chain: { chainId: 8453, name: "base-mainnet" },
      trustScore: 55,
      tier: "SILVER",
      breakdown: { onChainRegistration: 30, reputation: 25, walletVerified: 0, agentCard: 0, domainWellKnown: 0, paymentHistory: 0 },
      registered: false,
      owner: null,
      agentWallet: null,
      agentUri: null,
      reputationCount: 0,
      resolutionSource: "none",
      guidance: null,
      cached: false,
      flags: [],
    };
    (cacheGet as ReturnType<typeof vi.fn>).mockReturnValue(cached);

    const result = await computeTrustScore({ walletAddress: VALID_WALLET });

    expect(result.cached).toBe(true);
    expect(result.trustScore).toBe(55);
    expect(result.tier).toBe("SILVER");
    expect(resolveAgentId).not.toHaveBeenCalled();
  });

  it("skips cache when skipCache=true", async () => {
    (cacheGet as ReturnType<typeof vi.fn>).mockReturnValue({ trustScore: 99 });

    const result = await computeTrustScore({ walletAddress: VALID_WALLET, skipCache: true });

    // resolveAgentId should have been called (cache bypassed)
    expect(resolveAgentId).toHaveBeenCalled();
    expect(result.trustScore).not.toBe(99);
  });

  // ── Unregistered agent (happy path, no agentId) ─────────────────────────────

  it("returns UNVERIFIED with score 0 for an unregistered wallet", async () => {
    const result = await computeTrustScore({ walletAddress: VALID_WALLET });

    expect(result.tier).toBe("UNVERIFIED");
    expect(result.trustScore).toBe(0);
    expect(result.registered).toBe(false);
    expect(result.cached).toBe(false);
    expect(cacheSet).toHaveBeenCalledOnce();
  });

  // ── RPC timeout → UNVERIFIED fallback ───────────────────────────────────────

  it("returns UNVERIFIED fallback and logs warn on RPC timeout", async () => {
    vi.useFakeTimers();

    // resolveAgentId hangs forever
    (resolveAgentId as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const promise = computeTrustScore({ walletAddress: VALID_WALLET });

    // Advance past the 8 000 ms default RPC_TIMEOUT_MS
    await vi.advanceTimersByTimeAsync(9_000);

    const result = await promise;

    expect(result.tier).toBe("UNVERIFIED");
    expect(result.trustScore).toBe(0);
    expect(result.flags).toContain("rpc_timeout");
    expect(result.guidance).toMatch(/timed out/i);
    expect(result.registered).toBe(false);

    // logger.warn should have been called with timeout message
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: "rpc_timeout" }),
      expect.stringContaining("RPC timeout"),
    );

    // Result is still cached even on timeout fallback
    expect(cacheSet).toHaveBeenCalledOnce();
  });

  // ── RPC error → UNVERIFIED fallback ────────────────────────────────────────

  it("returns UNVERIFIED fallback and logs warn on non-timeout RPC error", async () => {
    (resolveAgentId as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network_error"),
    );

    const result = await computeTrustScore({ walletAddress: VALID_WALLET });

    expect(result.tier).toBe("UNVERIFIED");
    expect(result.trustScore).toBe(0);
    expect(result.flags).toContain("rpc_error");
    expect(result.guidance).toMatch(/RPC error/i);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: "network_error" }),
      expect.stringContaining("RPC error"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("meetsMinTier", () => {
  it("GOLD meets GOLD", () => expect(meetsMinTier("GOLD", "GOLD")).toBe(true));
  it("PLATINUM meets GOLD", () => expect(meetsMinTier("PLATINUM", "GOLD")).toBe(true));
  it("SILVER does not meet GOLD", () => expect(meetsMinTier("SILVER", "GOLD")).toBe(false));
  it("UNVERIFIED meets UNVERIFIED", () => expect(meetsMinTier("UNVERIFIED", "UNVERIFIED")).toBe(true));
  it("UNKNOWN does not meet UNVERIFIED", () => expect(meetsMinTier("UNKNOWN", "UNVERIFIED")).toBe(false));
});
