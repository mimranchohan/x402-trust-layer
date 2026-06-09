import { describe, expect, it } from "vitest";
import { hmacSign, verifyHmac } from "./crypto.js";

describe("replay binding signature", () => {
  it("verifyHmac is timing-safe compatible", () => {
    const payload = JSON.stringify({ bindingId: "rb_abc", nonce: "n1" });
    const sig = hmacSign(payload);
    expect(verifyHmac(payload, sig)).toBe(true);
    expect(verifyHmac(payload, sig + "0")).toBe(false);
  });
});
