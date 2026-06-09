import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRiskGate } from "./risk-gate.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../lib/probe.js", () => ({
  hostOf: vi.fn((url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }),
  probeEndpoint: vi.fn(),
}));

vi.mock("../lib/ssrf.js", () => ({
  assertSafeOutboundUrl: vi.fn(),
  UnsafeUrlError: class UnsafeUrlError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "UnsafeUrlError";
    }
  },
}));

vi.mock("../lib/security.js", () => ({
  assessUrlSecurity: vi.fn(),
  mergeSecurityIntoRisk: vi.fn(),
}));

vi.mock("../lib/agentic-gateways.js", () => ({
  isKnownAgenticGateway: vi.fn(),
  isExpectedAgenticGatewayProbeStatus: vi.fn(),
}));

import { probeEndpoint } from "../lib/probe.js";
import { assertSafeOutboundUrl, UnsafeUrlError } from "../lib/ssrf.js";
import { assessUrlSecurity, mergeSecurityIntoRisk } from "../lib/security.js";
import { isKnownAgenticGateway, isExpectedAgenticGatewayProbeStatus } from "../lib/agentic-gateways.js";

// ---------------------------------------------------------------------------
// Default mock implementations
// ---------------------------------------------------------------------------
const safeProbeResult = {
  url: "https://api.example.com/agent",
  status: 402,
  requiresPayment: true,
  authMode: "paid" as const,
  priceUsdc: 0.10,
  network: "base",
  payTo: "0xabcdef1234567890abcdef1234567890abcdef12",
  paymentOptions: [],
  warnings: [],
};

const safeSecurityResult = {
  recommendations: [] as string[],
  threats: [] as string[],
  score: 0,
  grade: "A" as const,
};

const safeMergedResult = {
  riskScore: 10,
  securityGrade: "A" as const,
  combinedThreats: [] as string[],
};

beforeEach(() => {
  vi.mocked(assertSafeOutboundUrl).mockReturnValue(undefined);
  vi.mocked(probeEndpoint).mockResolvedValue(safeProbeResult);
  vi.mocked(assessUrlSecurity).mockReturnValue(safeSecurityResult);
  vi.mocked(mergeSecurityIntoRisk).mockReturnValue(safeMergedResult);
  vi.mocked(isKnownAgenticGateway).mockReturnValue(false);
  vi.mocked(isExpectedAgenticGatewayProbeStatus).mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("runRiskGate — URL validation", () => {
  it("blocks an invalid / non-parseable URL (hostOf returns null)", async () => {
    const { hostOf } = await import("../lib/probe.js");
    vi.mocked(hostOf).mockReturnValueOnce(null);

    const result = await runRiskGate({ targetUrl: "not-a-url" });
    expect(result.safe).toBe(false);
    expect(result.riskScore).toBe(100);
    expect(result.securityGrade).toBe("F");
    expect(result.reasons).toContain("Invalid URL");
  });

  it("blocks when assertSafeOutboundUrl throws UnsafeUrlError (SSRF / private IP)", async () => {
    const Err = (await import("../lib/ssrf.js")).UnsafeUrlError;
    vi.mocked(assertSafeOutboundUrl).mockImplementationOnce(() => {
      throw new Err("Private IP range blocked");
    });
    const result = await runRiskGate({ targetUrl: "https://192.168.1.1/api" });
    expect(result.safe).toBe(false);
    expect(result.riskScore).toBe(100);
    expect(result.reasons[0]).toMatch(/private ip/i);
  });
});

describe("runRiskGate — probe results", () => {
  it("marks safe when probe returns 402 and all checks pass", async () => {
    const result = await runRiskGate({ targetUrl: "https://api.example.com/agent" });
    expect(result.safe).toBe(true);
    expect(result.riskScore).toBe(10);
    expect(result.securityGrade).toBe("A");
  });

  it("adds risk when probe returns 200 (not x402-protected)", async () => {
    vi.mocked(probeEndpoint).mockResolvedValue({
      ...safeProbeResult,
      status: 200,
      requiresPayment: false,
    });
    // Merge will see increased riskScore from the 200 detection
    vi.mocked(mergeSecurityIntoRisk).mockReturnValue({
      riskScore: 25,
      securityGrade: "B",
      combinedThreats: [],
    });
    const result = await runRiskGate({ targetUrl: "https://api.example.com/agent" });
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/not x402-protected/i)]),
    );
  });

  it("adds risk when endpoint is unreachable (status 0)", async () => {
    vi.mocked(probeEndpoint).mockResolvedValue({
      ...safeProbeResult,
      status: 0,
      requiresPayment: false,
    });
    const result = await runRiskGate({ targetUrl: "https://api.example.com/agent" });
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/unreachable/i)]),
    );
  });

  it("does not penalise known agentic gateways returning 401/403", async () => {
    vi.mocked(isKnownAgenticGateway).mockReturnValue(true);
    vi.mocked(isExpectedAgenticGatewayProbeStatus).mockReturnValue(true);
    vi.mocked(probeEndpoint).mockResolvedValue({
      ...safeProbeResult,
      status: 401,
      requiresPayment: false,
    });
    const result = await runRiskGate({ targetUrl: "https://x402.alchemy.com/agent" });
    // No "not x402-protected" penalty for known gateways
    expect(result.reasons).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/not x402-protected/i)]),
    );
  });
});

describe("runRiskGate — policy checks", () => {
  it("adds risk when probed price exceeds per-call cap", async () => {
    vi.mocked(probeEndpoint).mockResolvedValue({
      ...safeProbeResult,
      priceUsdc: 5.0,
    });
    const result = await runRiskGate({
      targetUrl: "https://api.example.com/agent",
      policy: { perCallCapUsdc: 1.0 },
    });
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/exceeds cap/i)]),
    );
  });

  it("adds risk when estimated cost is suspiciously lower than probed price", async () => {
    vi.mocked(probeEndpoint).mockResolvedValue({
      ...safeProbeResult,
      priceUsdc: 1.0,
    });
    const result = await runRiskGate({
      targetUrl: "https://api.example.com/agent",
      estimatedCostUsdc: 0.1, // less than 50% of probed price
    });
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/suspiciously lower/i)]),
    );
  });

  it("blocks when policy.blockedHosts includes the target host", async () => {
    vi.mocked(mergeSecurityIntoRisk).mockReturnValue({
      riskScore: 80,
      securityGrade: "F",
      combinedThreats: [],
    });
    const result = await runRiskGate({
      targetUrl: "https://bad-actor.example.com/api",
      policy: { blockedHosts: ["bad-actor.example.com"] },
    });
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/blocked host/i)]),
    );
  });
});

describe("runRiskGate — security assessment", () => {
  it("includes security recommendations from assessUrlSecurity", async () => {
    vi.mocked(assessUrlSecurity).mockReturnValue({
      ...safeSecurityResult,
      recommendations: ["Enable HSTS", "Use TLS 1.3"],
    });
    const result = await runRiskGate({ targetUrl: "https://api.example.com/agent" });
    expect(result.securityRecommendations).toContain("Enable HSTS");
    expect(result.securityRecommendations).toContain("Use TLS 1.3");
  });

  it("passes fastProbe option to probeEndpoint when fastProbe=true", async () => {
    await runRiskGate({ targetUrl: "https://api.example.com/agent", fastProbe: true });
    expect(probeEndpoint).toHaveBeenCalledWith(
      "https://api.example.com/agent",
      { fastSynthetic: true },
    );
  });
});
