import { config } from "../config.js";

type SupportedKind = {
  scheme: string;
  network: string;
  extra?: Record<string, unknown>;
};

let extrasByNetworkScheme = new Map<string, Record<string, unknown>>();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

function cacheKey(network: string, scheme: string): string {
  return `${network}|${scheme}`;
}

/** Load facilitator /supported extras (permit2 on Base, feePayer on Solana, etc.). */
export async function refreshFacilitatorExtras(
  facilitatorUrl = config.facilitatorUrl,
): Promise<void> {
  const base = facilitatorUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/supported`, {
    signal: AbortSignal.timeout(Number(process.env.X402_FACILITATOR_TIMEOUT_MS ?? 90_000)),
  });
  if (!res.ok) {
    throw new Error(`Facilitator /supported HTTP ${res.status}`);
  }
  const body = (await res.json()) as { kinds?: SupportedKind[] };
  const next = new Map<string, Record<string, unknown>>();
  for (const kind of body.kinds ?? []) {
    if (kind.extra && kind.network && kind.scheme) {
      next.set(cacheKey(kind.network, kind.scheme), kind.extra);
    }
  }
  extrasByNetworkScheme = next;
  cacheLoadedAt = Date.now();
}

export async function ensureFacilitatorExtras(): Promise<void> {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS && extrasByNetworkScheme.size > 0) return;
  await refreshFacilitatorExtras();
}

/**
 * Merge facilitator extras into 402 accepts so EVM clients use Permit2 on Base
 * (Dexter facilitator returns 500 if payer signs EIP-712 but settle expects permit2).
 */
export function enrichAcceptFromFacilitator(accept: {
  network?: string;
  scheme?: string;
  extra?: Record<string, unknown>;
}): void {
  if (!accept.network) return;
  const scheme = accept.scheme ?? "exact";
  const facilitatorExtra = extrasByNetworkScheme.get(cacheKey(accept.network, scheme));
  if (!facilitatorExtra) return;
  accept.extra = { ...facilitatorExtra, ...accept.extra };
}

export function startFacilitatorExtrasRefresh(intervalMs = CACHE_TTL_MS): void {
  const tick = () => {
    void refreshFacilitatorExtras().catch((err) => {
      console.warn(
        "[facilitator-extra] refresh failed:",
        err instanceof Error ? err.message : err,
      );
    });
  };
  setInterval(tick, intervalMs).unref?.();
}
