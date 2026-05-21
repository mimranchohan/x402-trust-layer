import type { Request, Response, NextFunction } from "express";
import { x402Middleware } from "@dexterai/x402/server";
import { config } from "../config.js";
import { CHAIN_IDS, usdcAssetForCaip2, type ChainKey } from "./chains.js";
import { VERIFY_EXAMPLES } from "./verify-examples.js";

function resolvePayTo(): string | Record<string, string> {
  if (!config.payToEvm) return config.payTo;
  const map: Record<string, string> = {
    [CHAIN_IDS.solana]: config.payTo,
    [CHAIN_IDS.base]: config.payToEvm,
  };
  if (config.chains.includes("polygon")) {
    map[CHAIN_IDS.polygon] = config.payToEvm;
  }
  return map;
}

function resourceUrl(path: string): string {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

const baseMiddleware = {
  payTo: resolvePayTo(),
  facilitatorUrl: config.facilitatorUrl,
  network: [...config.networks],
  onSettlement: (info: { transaction?: string; payer?: string; network?: string }) => {
    console.log(`[x402] settled tx=${info.transaction} payer=${info.payer} network=${info.network}`);
  },
};

type PaidMw = ReturnType<typeof x402Middleware>;

function buildBazaarInfo(method: string, inputExample: unknown) {
  const upper = method.toUpperCase();
  if (upper === "GET") {
    return {
      input: { type: "http" as const, method: "GET" as const, queryParams: {} },
      output: {
        type: "json" as const,
        example: { ok: true, method: "GET", note: "Use POST for full API response" },
      },
    };
  }
  return {
    input: {
      type: "http" as const,
      method: "POST" as const,
      bodyType: "json" as const,
      body: inputExample ?? {},
    },
    output: {
      type: "json" as const,
      example: { ok: true },
    },
  };
}

function buildBazaarSchema(inputExample: unknown) {
  const props =
    inputExample && typeof inputExample === "object"
      ? Object.fromEntries(
          Object.keys(inputExample as Record<string, unknown>).map((k) => [
            k,
            { type: "string", description: k },
          ]),
        )
      : {};
  return {
    input: {
      type: "object",
      properties: Object.keys(props).length ? props : { _placeholder: { type: "string" } },
    },
    output: {
      type: "object",
      properties: { ok: { type: "boolean" } },
    },
  };
}

type PaymentAccept = {
  network?: string;
  asset?: string;
  payTo?: string;
};

function normalizeAccepts(parsed: Record<string, unknown>): void {
  const accepts = parsed.accepts as PaymentAccept[] | undefined;
  if (!Array.isArray(accepts)) return;

  const chainOrder = config.chains.map((c) => CHAIN_IDS[c as ChainKey]);

  for (const accept of accepts) {
    if (!accept.network) continue;
    const correctAsset = usdcAssetForCaip2(accept.network);
    if (correctAsset) accept.asset = correctAsset;
  }

  accepts.sort((a, b) => {
    const ia = chainOrder.indexOf(a.network ?? "");
    const ib = chainOrder.indexOf(b.network ?? "");
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  parsed.accepts = accepts;
}

function injectBazaarExtension(encoded: string, req: Request): string {
  try {
    const path = req.path;
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    normalizeAccepts(parsed);
    const example = VERIFY_EXAMPLES[path];
    const bazaar = {
      info: buildBazaarInfo(req.method, example),
      schema: buildBazaarSchema(example),
    };
    const extensions = (parsed.extensions as Record<string, unknown> | undefined) ?? {};
    parsed.extensions = { ...extensions, bazaar };
    const resource = parsed.resource as { url?: string } | undefined;
    if (resource) {
      resource.url = resourceUrl(path);
    }
    return Buffer.from(JSON.stringify(parsed)).toString("base64");
  } catch {
    return encoded;
  }
}

/** x402 middleware with PAYMENT-REQUIRED header + Bazaar extension for Agentic Market */
export function createPaidMiddleware(): (
  amount: string,
  description: string,
) => PaidMw {
  return (amount: string, description: string) => {
    const inner = x402Middleware({
      ...baseMiddleware,
      amount,
      description,
      verbose: false,
      timeoutSeconds: 120,
      getResourceUrl: (req) => resourceUrl(req.path),
    });

    return (req: Request, res: Response, next: NextFunction) => {
      const origJson = res.json.bind(res);
      res.json = ((body?: unknown) => {
        if (res.statusCode === 402 && body && typeof body === "object") {
          normalizeAccepts(body as Record<string, unknown>);
        }
        return origJson(body);
      }) as typeof res.json;

      const origSetHeader = res.setHeader.bind(res);
      const patchedSetHeader = (
        name: string,
        value: string | number | readonly string[],
      ): Response => {
        let headerValue = value;
        if (
          name.toUpperCase() === "PAYMENT-REQUIRED" &&
          typeof headerValue === "string"
        ) {
          headerValue = injectBazaarExtension(headerValue, req);
        }
        return origSetHeader(name, headerValue);
      };
      res.setHeader = patchedSetHeader as typeof res.setHeader;

      inner(req, res, next);
    };
  };
}
