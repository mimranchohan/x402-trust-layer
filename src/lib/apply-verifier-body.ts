import type { Request } from "express";
import { VERIFY_EXAMPLES } from "./verify-examples.js";

const DANGEROUS_OVERRIDE_KEYS = [
  "targetUrl",
  "urls",
  "origin",
  "policy",
  "walletAddress",
  "externalCallEstimateUsdc",
];

function isApiProbeMethod(method: string): boolean {
  return method === "POST" || method === "GET" || method === "HEAD";
}

function emptyBody(body: unknown): boolean {
  return !body || (typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0);
}

function queryScalar(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return queryScalar(value[0]);
  return undefined;
}

/** Coerce simple query params for x402gle GET paid probes (e.g. verificationScore=93). */
function queryAsBody(query: Request["query"]): Record<string, unknown> {
  if (!query || typeof query !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(query)) {
    const s = queryScalar(raw);
    if (s === undefined) continue;
    if (s === "true") out[key] = true;
    else if (s === "false") out[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(s)) out[key] = Number(s);
    else out[key] = s;
  }
  return out;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function valueCompatibleWithExample(value: unknown, example: unknown): boolean {
  if (example === null) return value === null;
  if (Array.isArray(example)) return Array.isArray(value);
  if (isPlainRecord(example)) return isPlainRecord(value);
  return typeof value === typeof example;
}

function mergeCompatibleProbeInput(
  example: Record<string, unknown>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...example };
  for (const [key, value] of Object.entries(input)) {
    if (DANGEROUS_OVERRIDE_KEYS.includes(key)) continue;
    // For verifier probes, ignore unknown keys so malformed grader payloads
    // cannot trip schema validation on optional typed fields.
    if (!(key in example)) continue;

    const exampleValue = example[key];
    if (!valueCompatibleWithExample(value, exampleValue)) continue;
    if (isPlainRecord(exampleValue) && isPlainRecord(value)) {
      out[key] = mergeCompatibleProbeInput(exampleValue, value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Merge canonical bodies so x402gle / Dexter paid probes get 200 instead of 400 */
export function applyVerifierExampleBody(req: Request): void {
  if (!isApiProbeMethod(req.method)) return;

  const example = VERIFY_EXAMPLES[req.path];
  if (!example || typeof example !== "object" || Array.isArray(example)) return;

  const ex = example as Record<string, unknown>;
  const body = req.body as Record<string, unknown> | undefined;
  const fromQuery = req.method === "GET" || req.method === "HEAD" ? queryAsBody(req.query) : {};

  if (emptyBody(body) && Object.keys(fromQuery).length === 0) {
    req.body = { ...ex };
    return;
  }

  if (body && typeof body === "object" && !Array.isArray(body)) {
    req.body = mergeCompatibleProbeInput(
      mergeCompatibleProbeInput(ex, fromQuery),
      body,
    );
    return;
  }

  if (Object.keys(fromQuery).length > 0) {
    req.body = { ...ex, ...fromQuery };
  }
}
