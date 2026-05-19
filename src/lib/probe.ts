export type ProbeResult = {
  url: string;
  status: number;
  requiresPayment: boolean;
  authMode: "paid" | "unprotected" | "unknown";
  priceUsdc: number | null;
  network: string | null;
  payTo: string | null;
  warnings: string[];
};

function parse402Body(body: unknown): Pick<ProbeResult, "priceUsdc" | "network" | "payTo"> {
  if (!body || typeof body !== "object") {
    return { priceUsdc: null, network: null, payTo: null };
  }

  const record = body as Record<string, unknown>;
  const options = Array.isArray(record.paymentOptions)
    ? (record.paymentOptions as Array<Record<string, unknown>>)
    : [];

  const first = options[0];
  if (!first) return { priceUsdc: null, network: null, payTo: null };

  return {
    priceUsdc: typeof first.price === "number" ? first.price : null,
    network: typeof first.network === "string" ? first.network : null,
    payTo: typeof first.payTo === "string" ? first.payTo : null,
  };
}

export async function probeEndpoint(targetUrl: string): Promise<ProbeResult> {
  const warnings: string[] = [];
  let status = 0;
  let body: unknown = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
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
      warnings,
    };
  }

  const parsed = parse402Body(body);
  const requiresPayment = status === 402;

  return {
    url: targetUrl,
    status,
    requiresPayment,
    authMode: requiresPayment ? "paid" : status === 200 ? "unprotected" : "unknown",
    priceUsdc: parsed.priceUsdc,
    network: parsed.network,
    payTo: parsed.payTo,
    warnings,
  };
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
