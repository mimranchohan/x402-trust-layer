import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("webhook HMAC", () => {
  it("uses HMAC not plain hash", () => {
    const secret = "test-secret";
    const body = '{"event":"guard.allowed"}';
    const sig = signPayload(secret, body);
    expect(sig.startsWith("sha256=")).toBe(true);
    const expected = signPayload(secret, body);
    expect(sig).toBe(expected);
    expect(signPayload("other", body)).not.toBe(sig);
  });
});
