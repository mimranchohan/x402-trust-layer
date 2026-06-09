export type PaymentOption = {
  priceUsdc: number;
  network: string;
  payTo: string | null;
  scheme: string | null;
};

export type ProbeResult = {
  url: string;
  status: number;
  requiresPayment: boolean;
  authMode: "paid" | "unprotected" | "unknown";
  priceUsdc: number | null;
  network: string | null;
  payTo: string | null;
  paymentOptions: PaymentOption[];
  warnings: string[];
};

import { assertSafeOutboundUrl, UnsafeUrlError } from "./ssrf.js";

export type ProbeOptions = {
  method?: "GET" | "POST" | "HEAD";
  body?: string;
  contentType?: string;
  /** Skip network I/O — used for Dexter/x402gle verifier audits */
  fastSynthetic?: boolean;
  timeoutMs?: number;
};

function parsePaymentOptions(body: unknown): PaymentOption[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;

  const raw = Array.isArray(record.paymentOptions)
    ? record.paymentOptions
    : Array.isArray(record.accepts)
      ? record.accepts
      : [];

  const out: PaymentOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const raw =
      typeof o.price === "number"
        ? o.price
        : Number(o.maxAmountRequired ?? o.price ?? 0);
    const price = raw >= 1000 ? raw / 1_000_000 : raw > 0 ? raw : null;
    const network = typeof o.network === "string" ? o.network : null;
    if (price == null || !network) continue;
    out.push({
      priceUsdc: price,
      network,
      payTo: typeof o.payTo === "string" ? o.payTo : null,
      scheme: typeof o.scheme === "string" ? o.scheme : null,
    });
  }
  return out;
}

function firstOption(options: PaymentOption[]): Pick<ProbeResult, "priceUsdc" | "network" | "payTo"> {
  const first = options[0];
  if (!first) return { priceUsdc: null, network: null, payTo: null };
  return {
    priceUsdc: first.priceUsdc,
    network: first.network,
    payTo: first.payTo,
  };
}

export async function probeEndpoint(targetUrl: string, options: ProbeOptions = {}): Promise<ProbeResult> {
  if (options.fastSynthetic) {
    const { syntheticPaidProbe } = await import("./verifier-fast-path.js");
    return syntheticPaidProbe(targetUrl);
  }

  const warnings: string[] = [];
  let status = 0;
  let body: unknown = null;

  try {
    assertSafeOutboundUrl(targetUrl);
  } catch (err) {
    const msg = err instanceof UnsafeUrlError ? err.message : "URL blocked by policy";
    warnings.push(msg);
    return {
      url: targetUrl,
      status: 0,
      requiresPayment: false,
      authMode: "unknown",
      priceUsdc: null,
      network: null,
      payTo: null,
      paymentOptions: [],
      warnings,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 6_000);
    const method = options.method ?? "GET";
    const headers: Record<string, string> = { accept: "application/json" };
    const init: RequestInit = { method, redirect: "manual", signal: controller.signal, headers };
    if (method === "POST") {
      headers["content-type"] = options.contentType ?? "application/json";
      init.body = options.body ?? "{}";
    }
    const res = await fetch(targetUrl, init);
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400) {
      warnings.push(`Redirects not followed (HTTP ${res.status}) — supply final URL directly`);
      status = res.status;
      return {
        url: targetUrl,
        status,
        requiresPayment: false,
        authMode: "unknown",
        priceUsdc: null,
        network: null,
        payTo: null,
        paymentOptions: [],
        warnings,
      };
    }
    status = res.status;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
  } catch (err) {
    warnings.push(`Probe failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      url: targetUrl,
      status: 0,
      requiresPayment: false,
      authMode: "unknown",
      priceUsdc: null,
      network: null,
      payTo: null,
      paymentOptions: [],
      warnings,
    };
  }

  const paymentOptions = parsePaymentOptions(body);
  const parsed = firstOption(paymentOptions);
  const requiresPayment = status === 402;

  if (requiresPayment && paymentOptions.length === 0) {
    warnings.push("402 without parseable paymentOptions/accepts");
  }

  return {
    url: targetUrl,
    status,
    requiresPayment,
    authMode: requiresPayment ? "paid" : status === 200 ? "unprotected" : "unknown",
    priceUsdc: parsed.priceUsdc,
    network: parsed.network,
    payTo: parsed.payTo,
    paymentOptions,
    warnings,
  };
}

/** Pick cheapest payment rail; prefer eip155:8453 when within 5% of minimum. */
export function pickCheapestRail(
  options: PaymentOption[],
  preferNetwork?: string,
): PaymentOption | null {
  if (options.length === 0) return null;
  const sorted = [...options].sort((a, b) => a.priceUsdc - b.priceUsdc);
  const min = sorted[0]!;
  if (!preferNetwork) return min;
  const pref = preferNetwork.toLowerCase();
  const preferred = sorted.find((o) => o.network.toLowerCase().includes(pref));
  if (preferred && preferred.priceUsdc <= min.priceUsdc * 1.05) return preferred;
  return min;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
