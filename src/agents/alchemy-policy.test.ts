import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runAlchemySimulationShield } from "./alchemy-policy.js";

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("Alchemy Policy - Simulation Shield Error Handling", () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const sampleInput = {
    agentId: "test-agent",
    transaction: {
      from: "0x1234567890123456789012345678901234567890",
      to: "0x0987654321098765432109876543210987654321",
      data: "0x",
      value: "0x0",
    },
    chainId: 8453,
  };

  it("handles HTTP 429 rate limit errors", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 429,
      ok: false,
      text: async () => "Rate limit exceeded",
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(false);
    expect(result.detectedThreats).toContain("simulation_failed");
    expect(result.summary).toContain("Alchemy rate limit exceeded (HTTP 429)");
    expect(result.securityGrade).toBe("C");
  });

  it("handles HTTP 401 unauthorized errors", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 401,
      ok: false,
      text: async () => "Unauthorized",
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(false);
    expect(result.detectedThreats).toContain("simulation_failed");
    expect(result.summary).toContain("Alchemy API key invalid or unauthorized (HTTP 401)");
    expect(result.securityGrade).toBe("C");
  });

  it("handles HTTP 403 forbidden errors", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 403,
      ok: false,
      text: async () => "Forbidden",
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(false);
    expect(result.detectedThreats).toContain("simulation_failed");
    expect(result.summary).toContain("Alchemy access forbidden (HTTP 403)");
    expect(result.securityGrade).toBe("C");
  });

  it("handles HTTP 500 internal server errors", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 500,
      ok: false,
      text: async () => "Internal Server Error",
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(false);
    expect(result.detectedThreats).toContain("simulation_failed");
    expect(result.summary).toContain("Alchemy internal server error (HTTP 500)");
    expect(result.securityGrade).toBe("C");
  });

  it("handles JSON-RPC code -32700 Parse error", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32700, message: "Parse error" }
      }),
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(false);
    expect(result.detectedThreats).toContain("simulation_failed");
    expect(result.summary).toContain("Alchemy JSON-RPC Parse error (-32700)");
  });

  it("handles JSON-RPC code -32601 Method not found", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32601, message: "Method not found" }
      }),
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(false);
    expect(result.detectedThreats).toContain("simulation_failed");
    expect(result.summary).toContain("Alchemy JSON-RPC Method not found (-32601)");
  });

  it("handles JSON-RPC code -32602 Invalid params", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32602, message: "Invalid params" }
      }),
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(false);
    expect(result.detectedThreats).toContain("simulation_failed");
    expect(result.summary).toContain("Alchemy JSON-RPC Invalid params (-32602)");
  });

  it("handles JSON-RPC code -32000 Server error range", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32005, message: "Custom node error" }
      }),
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(false);
    expect(result.detectedThreats).toContain("simulation_failed");
    expect(result.summary).toContain("Alchemy JSON-RPC Server error (-32005)");
  });

  it("runs the JS Tracer fallback flow when execution simulation returns -32603 or tracer disabled error", async () => {
    // 1. asset changes succeeds
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: { changes: [] }
      }),
    } as any);

    // 2. execution simulation fails with JS tracer error (-32603)
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32603, message: "JS Tracer is not enabled on base-mainnet" }
      }),
    } as any);

    // 3. Fallback eth_call succeeds (no revert)
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 3,
        result: "0x"
      }),
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(true);
    expect(result.reverted).toBe(false);
    expect(result.detectedThreats).toHaveLength(0);
    expect(result.securityGrade).toBe("A");
  });

  it("runs the JS Tracer fallback flow when BOTH asset changes and execution simulation return tracer disabled errors", async () => {
    // 1. asset changes fails with JS tracer error (-32603)
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32603, message: "JS Tracer is not enabled" }
      }),
    } as any);

    // 2. execution simulation fails with JS tracer error (-32603)
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32603, message: "JS Tracer is not enabled" }
      }),
    } as any);

    // 3. Fallback eth_call succeeds (no revert)
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 3,
        result: "0x"
      }),
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(true);
    expect(result.reverted).toBe(false);
    expect(result.detectedThreats).toHaveLength(0);
    expect(result.securityGrade).toBe("A");
  });

  it("completes normal simulation successfully", async () => {
    // 1. asset changes succeeds
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: { changes: [] }
      }),
    } as any);

    // 2. execution simulation succeeds
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 2,
        result: { error: "" }
      }),
    } as any);

    const result = await runAlchemySimulationShield(sampleInput);
    expect(result.safe).toBe(true);
    expect(result.reverted).toBe(false);
    expect(result.detectedThreats).toHaveLength(0);
    expect(result.securityGrade).toBe("A");
  });
});
