import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { hostOf } from "./probe.js";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.goog",
]);

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".lan"];

export function isPrivateOrReservedIp(ip: string): boolean {
  if (ip === "::1") return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("169.254.")) return true;

  if (!isIP(ip)) return false;
  if (ip.includes(":")) {
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
  }

  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function hostnameLooksLikeIp(host: string): boolean {
  if (isIP(host)) return true;
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  if (/^\d+$/.test(host)) return true;
  return false;
}

/** Deny SSRF targets before any outbound fetch. */
export function assertSafeOutboundUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UnsafeUrlError("Only http(s) URLs are allowed");
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError("URL must not include credentials");
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) throw new UnsafeUrlError("Missing hostname");

  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new UnsafeUrlError(`Blocked hostname: ${host}`);
  }

  for (const suffix of BLOCKED_SUFFIXES) {
    if (host === suffix.slice(1) || host.endsWith(suffix)) {
      throw new UnsafeUrlError(`Blocked hostname suffix: ${suffix}`);
    }
  }

  if (hostnameLooksLikeIp(host) && isPrivateOrReservedIp(host)) {
    throw new UnsafeUrlError("Private or reserved IP addresses are not allowed");
  }

  if (host.endsWith(".google.internal") || host.includes("metadata")) {
    throw new UnsafeUrlError("Cloud metadata hosts are not allowed");
  }
}

/** DNS rebinding guard — resolve hostname and reject private/reserved targets. */
export async function assertSafeResolvedUrl(url: string): Promise<void> {
  assertSafeOutboundUrl(url);
  const { hostname } = new URL(url);
  if (hostnameLooksLikeIp(hostname)) return;
  try {
    const [ipv4, ipv6] = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
    const allIps = [
      ...(ipv4.status === "fulfilled" ? ipv4.value : []),
      ...(ipv6.status === "fulfilled" ? ipv6.value : []),
    ];
    if (allIps.length === 0) {
      throw new UnsafeUrlError(`DNS resolution failed for ${hostname}`);
    }
    for (const ip of allIps) {
      if (isPrivateOrReservedIp(ip)) {
        throw new UnsafeUrlError(`${hostname} resolves to private IP: ${ip} (DNS rebinding blocked)`);
      }
    }
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw e;
    throw new UnsafeUrlError(`DNS resolution failed for ${hostname}`);
  }
}

export function isSafeOutboundUrl(url: string): boolean {
  try {
    assertSafeOutboundUrl(url);
    return true;
  } catch {
    return false;
  }
}

export function safeHostOf(url: string): string | null {
  return hostOf(url);
}
