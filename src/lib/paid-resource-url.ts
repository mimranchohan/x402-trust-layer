import type { Request } from "express";
import { config } from "../config.js";

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0] ?? host;
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function canonicalPublicHost(): string | null {
  try {
    return new URL(config.publicBaseUrl).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Canonical x402 resource URL for the request being paid.
 * Local dev: use request Host. Production: reject foreign Host headers (SSRF/metadata injection).
 */
export function resolvePaidResourceUrl(req: Request): string {
  const pathOnly = (req.originalUrl ?? req.url ?? req.path).split("?")[0] || req.path;
  const path = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const fallback = `${base}${path}`;

  const hostHeader = req.get("host")?.trim();
  if (!hostHeader) return fallback;

  const reqHost = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  const publicHost = canonicalPublicHost();

  if (isLocalHost(reqHost)) {
    const forwarded = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto =
      forwarded === "https" || forwarded === "http"
        ? forwarded
        : req.protocol === "https"
          ? "https"
          : "http";
    return `${proto}://${hostHeader}${path}`;
  }

  if (publicHost && reqHost !== publicHost) {
    return fallback;
  }

  const forwarded = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwarded === "https" || forwarded === "http"
      ? forwarded
      : req.protocol === "https"
        ? "https"
        : "http";
  return `${proto}://${hostHeader}${path}`;
}
