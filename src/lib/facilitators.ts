export type FacilitatorHealth = {
  id: string;
  url: string;
  healthy: boolean;
  latencyMs: number | null;
  supportedNetworks: string[];
  error: string | null;
  synthetic?: boolean;
  note?: string;
};

const FACILITATORS = [
  { id: "dexter", url: "https://x402.dexter.cash" },
  { id: "coinbase", url: "https://api.cdp.coinbase.com/platform/v2/x402" },
] as const;

export async function checkFacilitatorHealth(
  facilitator: (typeof FACILITATORS)[number],
): Promise<FacilitatorHealth> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`${facilitator.url}/supported`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        id: facilitator.id,
        url: facilitator.url,
        healthy: false,
        latencyMs: Date.now() - start,
        supportedNetworks: [],
        error: `HTTP ${res.status}`,
      };
    }

    const body = (await res.json()) as { kinds?: Array<{ network?: string }> };
    const networks = (body.kinds ?? [])
      .map((k) => k.network)
      .filter((n): n is string => Boolean(n));

    return {
      id: facilitator.id,
      url: facilitator.url,
      healthy: true,
      latencyMs: Date.now() - start,
      supportedNetworks: networks,
      error: null,
    };
  } catch (err) {
    return {
      id: facilitator.id,
      url: facilitator.url,
      healthy: false,
      latencyMs: null,
      supportedNetworks: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function rankFacilitators(
  preferNetwork?: string,
  fastCheck = false,
): Promise<FacilitatorHealth[]> {
  if (fastCheck) {
    const note = "Fast-check synthetic data — not measured";
    return [
      {
        id: "dexter",
        url: "https://x402.dexter.cash",
        healthy: true,
        latencyMs: 8,
        supportedNetworks: [
          "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          "eip155:8453",
          "eip155:137",
        ],
        error: null,
        synthetic: true,
        note,
      },
      {
        id: "coinbase",
        url: "https://api.cdp.coinbase.com/platform/v2/x402",
        healthy: true,
        latencyMs: 12,
        supportedNetworks: ["eip155:8453"],
        error: null,
        synthetic: true,
        note,
      },
    ];
  }
  const results = await Promise.all(FACILITATORS.map(checkFacilitatorHealth));
  return results.sort((a, b) => {
    if (a.healthy !== b.healthy) return a.healthy ? -1 : 1;
    const aNet = preferNetwork && a.supportedNetworks.some((n) => n.includes(preferNetwork)) ? 1 : 0;
    const bNet = preferNetwork && b.supportedNetworks.some((n) => n.includes(preferNetwork)) ? 1 : 0;
    if (aNet !== bNet) return bNet - aNet;
    return (a.latencyMs ?? 99_999) - (b.latencyMs ?? 99_999);
  });
}
