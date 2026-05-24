import type { Request, Response, NextFunction } from "express";
import { USDC_BASE, x402Middleware } from "@dexterai/x402/server";
import { config } from "../config.js";
import { CHAIN_IDS, usdcAssetForCaip2, type ChainKey } from "./chains.js";
import { bazaarExtensionForRequest } from "./bazaar-extension.js";
import { resolvePaidResourceUrl } from "./paid-resource-url.js";

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

function syncResourceUrl(parsed: Record<string, unknown>, req: Request): void {
  const resource = parsed.resource as { url?: string } | undefined;
  if (resource) {
    resource.url = resolvePaidResourceUrl(req);
  }
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

function attachBazaarToPayload(parsed: Record<string, unknown>, req: Request): void {
  const bazaar = bazaarExtensionForRequest(req);
  const extensions = (parsed.extensions as Record<string, unknown> | undefined) ?? {};
  parsed.extensions = { ...extensions, bazaar };
}

type PaymentAccept = {
  network?: string;
  asset?: string;
  payTo?: string;
};

function normalizeAccepts(parsed: Record<string, unknown>): void {
  const accepts = parsed.accepts as PaymentAccept[] | undefined;
  if (!Array.isArray(accepts)) return;

  const chainOrder: string[] = config.chains.map((c) => CHAIN_IDS[c as ChainKey]);

  for (const accept of accepts) {
    if (!accept.network) continue;
    if (accept.network === CHAIN_IDS.base) {
      accept.asset = USDC_BASE;
    } else if (accept.network.startsWith("solana:")) {
      accept.asset = usdcAssetForCaip2(accept.network) ?? accept.asset;
    } else {
      const correctAsset = usdcAssetForCaip2(accept.network);
      if (correctAsset) accept.asset = correctAsset;
    }
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
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    normalizeAccepts(parsed);
    attachBazaarToPayload(parsed, req);
    syncResourceUrl(parsed, req);
    return Buffer.from(JSON.stringify(parsed)).toString("base64");
  } catch (err) {
    console.error("[x402-paid] injectBazaarExtension failed:", err);
    return encoded;
  }
}

function bodyHasAccepts(body: unknown): body is Record<string, unknown> {
  return (
    !!body &&
    typeof body === "object" &&
    Array.isArray((body as { accepts?: unknown }).accepts)
  );
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
      verbose: process.env.X402_VERBOSE === "1",
      timeoutSeconds: 120,
      getResourceUrl: (req) => resolvePaidResourceUrl(req),
    });

    return (req: Request, res: Response, next: NextFunction) => {
      const origJson = res.json.bind(res);
      res.json = ((body?: unknown) => {
        if (bodyHasAccepts(body)) {
          const payload = body as Record<string, unknown>;
          normalizeAccepts(payload);
          attachBazaarToPayload(payload, req);
          syncResourceUrl(payload, req);
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
