import { assertSafeOutboundUrl } from "../ssrf.js";
import { safeFetch } from "../safe-fetch.js";

export type AgentCardJson = {
  name?: string;
  description?: string;
  active?: boolean;
  status?: string;
  x402Support?: boolean;
  services?: unknown[];
  endpoints?: unknown[];
  registrations?: { domain?: string; url?: string }[];
  domain?: string;
  url?: string;
};

export type AgentCardScore = {
  points: number;
  maxPoints: number;
  valid: boolean;
  fields: string[];
  missing: string[];
  agentUri: string | null;
  domain: string | null;
};

export type WellKnownScore = {
  points: number;
  maxPoints: number;
  verified: boolean;
  url: string | null;
  error: string | null;
};

function parseDataUri(uri: string): AgentCardJson | null {
  const comma = uri.indexOf(",");
  if (comma < 0) return null;
  const payload = uri.slice(comma + 1);
  try {
    const text = uri.includes(";base64")
      ? Buffer.from(payload, "base64").toString("utf8")
      : decodeURIComponent(payload);
    return JSON.parse(text) as AgentCardJson;
  } catch {
    return null;
  }
}

function ipfsToHttps(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

export async function fetchAgentCard(agentUri: string): Promise<AgentCardJson | null> {
  if (agentUri.startsWith("data:")) {
    return parseDataUri(agentUri);
  }

  const url = ipfsToHttps(agentUri);
  if (!url.startsWith("http")) return null;

  try {
    assertSafeOutboundUrl(url);
    const res = await safeFetch(url, {
      headers: { accept: "application/json" },
      timeoutMs: 8000,
    });
    if (res.status >= 300 && res.status < 400) return null;
    if (!res.ok) return null;
    return (await res.json()) as AgentCardJson;
  } catch {
    return null;
  }
}

function extractDomain(card: AgentCardJson, agentUri: string): string | null {
  if (card.domain && typeof card.domain === "string") {
    return card.domain.replace(/^https?:\/\//, "").split("/")[0] ?? null;
  }
  const reg = card.registrations?.find((r) => r.domain);
  if (reg?.domain) return reg.domain.replace(/^https?:\/\//, "").split("/")[0] ?? null;
  try {
    if (agentUri.startsWith("http")) {
      return new URL(agentUri).hostname;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function scoreAgentCard(card: AgentCardJson | null, agentUri: string | null): AgentCardScore {
  const maxPoints = 15;
  if (!card) {
    return {
      points: 0,
      maxPoints,
      valid: false,
      fields: [],
      missing: ["name", "services", "x402Support", "active"],
      agentUri,
      domain: null,
    };
  }

  const fields: string[] = [];
  const missing: string[] = [];

  if (card.name && card.name.trim().length > 0) fields.push("name");
  else missing.push("name");

  const hasServices =
    (Array.isArray(card.services) && card.services.length > 0) ||
    (Array.isArray(card.endpoints) && card.endpoints.length > 0);
  if (hasServices) fields.push("services");
  else missing.push("services");

  const x402 =
    card.x402Support === true ||
    (Array.isArray(card.services) &&
      card.services.some(
        (s) =>
          typeof s === "object" &&
          s !== null &&
          ("x402" in s || "payment" in s || "protocol" in s),
      ));
  if (x402) fields.push("x402Support");
  else missing.push("x402Support");

  const active =
    card.active === true ||
    card.status === "active" ||
    card.status === "online";
  if (active) fields.push("active");
  else missing.push("active");

  const completeness = fields.length / 4;
  const points = Math.round(maxPoints * completeness);
  const domain = extractDomain(card, agentUri ?? "");

  return {
    points,
    maxPoints,
    valid: fields.length >= 3,
    fields,
    missing,
    agentUri,
    domain,
  };
}

export async function verifyWellKnown(domain: string | null): Promise<WellKnownScore> {
  const maxPoints = 10;
  if (!domain) {
    return { points: 0, maxPoints, verified: false, url: null, error: "no_domain_in_agent_card" };
  }

  const url = `https://${domain}/.well-known/agent-registration.json`;
  try {
    assertSafeOutboundUrl(url);
    const res = await safeFetch(url, {
      headers: { accept: "application/json" },
      timeoutMs: 6000,
    });
    if (res.status >= 300 && res.status < 400) {
      return { points: 0, maxPoints, verified: false, url, error: "redirect_not_followed" };
    }
    if (!res.ok) {
      return { points: 0, maxPoints, verified: false, url, error: `HTTP ${res.status}` };
    }
    const body = await res.json();
    if (body && typeof body === "object") {
      return { points: maxPoints, maxPoints, verified: true, url, error: null };
    }
    return { points: 0, maxPoints, verified: false, url, error: "invalid_json" };
  } catch (err) {
    return {
      points: 0,
      maxPoints,
      verified: false,
      url,
      error: err instanceof Error ? err.message : "fetch_failed",
    };
  }
}
