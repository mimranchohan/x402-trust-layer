import { hostOf } from "./probe.js";

export type HostTelemetry = {
  host: string;
  source: string;
  washTradePct?: number;
  observedTxns?: number;
  observedVolumeUsdc?: number;
  verifiedResources?: number;
  totalResources?: number;
  realVolumePct?: number;
  fetchedAt: string;
};

const WATCH_API = (process.env.X402WATCH_API_BASE ?? "https://api.x402.printmoneylab.com/api/v1").replace(
  /\/$/,
  "",
);

type WatchService = {
  id?: string;
  domain?: string;
  host?: string;
  url?: string;
  name?: string;
  txCount?: number;
  transactionCount?: number;
  volumeUsdc?: number;
  volume_usdc?: number;
  washPct?: number;
  wash_pct?: number;
  realVolumePct?: number;
  real_volume_pct?: number;
  resourceCount?: number;
  resources?: number;
  verifiedCount?: number;
};

function hostMatches(service: WatchService, host: string): boolean {
  const candidates = [service.domain, service.host, service.url, service.name].filter(Boolean) as string[];
  return candidates.some((c) => {
    try {
      const h = (c.includes("://") ? hostOf(c) : c.toLowerCase()) || "";
      return h.length > 0 && (h === host || h.endsWith(`.${host}`) || host.endsWith(`.${h}`));
    } catch {
      return c.toLowerCase().includes(host);
    }
  });
}

function pickService(services: WatchService[], host: string): WatchService | null {
  const exact = services.find((s) => hostMatches(s, host));
  if (exact) return exact;
  return services.find((s) => {
    const d = (s.domain ?? s.host ?? "").toLowerCase();
    return d && (host.includes(d) || d.includes(host));
  }) ?? null;
}

/**
 * Best-effort telemetry from x402watch public API (free tier).
 * Set X402WATCH_API_BASE to override. Falls back gracefully if unreachable.
 */
export async function fetchHostTelemetry(hostInput: string, targetUrl?: string): Promise<HostTelemetry | null> {
  const host = (hostInput || hostOf(targetUrl ?? "") || "").toLowerCase();
  if (!host) return null;

  const fetchedAt = new Date().toISOString();

  try {
    const searchUrl = `${WATCH_API}/services?search=${encodeURIComponent(host)}&limit=20`;
    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(Number(process.env.TELEMETRY_FETCH_MS ?? 8_000)),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: WatchService[]; services?: WatchService[] };
    const list = body.data ?? body.services ?? (Array.isArray(body) ? (body as WatchService[]) : []);
    const svc = pickService(list, host);
    if (!svc) return { host, source: "x402watch:miss", fetchedAt };

    const realPct = svc.realVolumePct ?? svc.real_volume_pct;
    const wash =
      svc.washPct ??
      svc.wash_pct ??
      (typeof realPct === "number" ? Math.max(0, Math.min(100, 100 - realPct)) : undefined);

    return {
      host,
      source: "x402watch",
      washTradePct: wash,
      observedTxns: svc.txCount ?? svc.transactionCount,
      observedVolumeUsdc: svc.volumeUsdc ?? svc.volume_usdc,
      verifiedResources: svc.verifiedCount,
      totalResources: svc.resourceCount ?? svc.resources,
      realVolumePct: realPct,
      fetchedAt,
    };
  } catch {
    return { host, source: "x402watch:unavailable", fetchedAt };
  }
}

export function mergeTelemetryIntoMerchantInput<T extends Record<string, unknown>>(
  input: T,
  telemetry: HostTelemetry | null,
): T & { telemetrySource?: string; telemetryFetchedAt?: string } {
  if (!telemetry || telemetry.source === "x402watch:miss" || telemetry.source === "x402watch:unavailable") {
    return { ...input, telemetrySource: telemetry?.source ?? "none" };
  }
  return {
    ...input,
    washTradePct: input.washTradePct ?? telemetry.washTradePct,
    observedTxns: input.observedTxns ?? telemetry.observedTxns,
    observedVolumeUsdc: input.observedVolumeUsdc ?? telemetry.observedVolumeUsdc,
    verifiedResources: input.verifiedResources ?? telemetry.verifiedResources,
    totalResources: input.totalResources ?? telemetry.totalResources,
    telemetrySource: telemetry.source,
    telemetryFetchedAt: telemetry.fetchedAt,
  };
}
