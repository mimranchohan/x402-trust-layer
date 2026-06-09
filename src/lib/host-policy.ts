/** Exact host or proper subdomain match (avoids `evilallowed.com` matching `allowed.com`). */
export function hostMatchesPattern(host: string, pattern: string): boolean {
  const h = host.toLowerCase().trim();
  const p = pattern.toLowerCase().trim();
  if (!h || !p) return false;
  if (h === p) return true;
  return h.endsWith(`.${p}`);
}

export function hostBlocked(host: string, blocked?: string[]): boolean {
  if (!blocked?.length) return false;
  return blocked.some((p) => hostMatchesPattern(host, p));
}

export function hostAllowed(host: string, allowed?: string[]): boolean {
  if (!allowed?.length) return true;
  return allowed.some((p) => hostMatchesPattern(host, p));
}
