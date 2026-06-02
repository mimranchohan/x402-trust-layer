import { assertSafeOutboundUrl } from "./ssrf.js";

export type SafeFetchInit = Omit<RequestInit, "redirect"> & {
  timeoutMs?: number;
};

/** Outbound fetch with SSRF hostname checks and redirects disabled (anti-SSRF). */
export async function safeFetch(url: string, init: SafeFetchInit = {}): Promise<Response> {
  assertSafeOutboundUrl(url);
  const { timeoutMs, ...rest } = init;
  const controller = new AbortController();
  const timer =
    timeoutMs != null ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    return await fetch(url, {
      ...rest,
      redirect: "manual",
      signal: rest.signal ?? controller.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
