import type { Request, Response, NextFunction } from "express";
import { x402Middleware } from "@dexterai/x402/server";
import { config } from "../config.js";
import { VERIFY_EXAMPLES } from "./verify-examples.js";

const baseMiddleware = {
  payTo: config.payTo,
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

function injectBazaarExtension(encoded: string, req: Request): string {
  try {
    const path = req.path;
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    const example = VERIFY_EXAMPLES[path];
    const bazaar = {
      info: buildBazaarInfo(req.method, example),
      schema: buildBazaarSchema(example),
    };
    const extensions = (parsed.extensions as Record<string, unknown> | undefined) ?? {};
    parsed.extensions = { ...extensions, bazaar };
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
    });

    return (req: Request, res: Response, next: NextFunction) => {
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
