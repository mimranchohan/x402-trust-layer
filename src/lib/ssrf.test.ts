import { describe, expect, it } from "vitest";
import { assertSafeOutboundUrl, isPrivateOrReservedIp, UnsafeUrlError } from "./ssrf.js";

describe("ssrf", () => {
  it("blocks localhost", () => {
    expect(() => assertSafeOutboundUrl("http://localhost/x")).toThrow(UnsafeUrlError);
  });

  it("blocks private IPv4", () => {
    expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
  });

  it("allows public https", () => {
    expect(() => assertSafeOutboundUrl("https://x402.dexter.cash/supported")).not.toThrow();
  });
});
