import type { Request, Response, NextFunction } from "express";
import { USDC_BASE, x402Middleware } from "@dexterai/x402/server";
import { config, isAllowedNetwork } from "../config.js";
import { logger } from "./logger.js";
import { CHAIN_IDS, usdcAssetForCaip2, type ChainKey } from "./chains.js";
import { bazaarExtensionForRequest } from "./bazaar-extension.js";
import { resolvePaidResourceUrl } from "./paid-resource-url.js";
import { getPaymentSignatureHeader, PAYMENT_REQUIRED } from "./x402-headers.js";
import {
  extractNonceFromPaymentHeader,
  isNonceAlreadyUsed,
  markNonceUsed,
  isIdempotencyKeyConsumed,
  markIdempotencyKeyUsed,
} from "./x402-payment-replay.js";
import { incCounter } from "./telemetry.js";
import { logSettlementFailure, checkCircuitBreaker } from "./settlement-failures.js";
import { isTrustedPayTo } from "./payto-guard.js";
import { enrichAcceptFromFacilitator, ensureFacilitatorExtras } from "./facilitator-extra.js";
import { paymentRequestAls, type PaymentRequestStore } from "./payment-request-context.js";
import { guardResponseWrites, isResponseLocked, lockResponse } from "./response-guard.js";

function resolvePayTo(): string | Record<string, string> {
  if (!config.payToEvm) return config.payTo;
  const map: Record<string, string> = {
    [CHAIN_IDS.solana]: config.payTo,
    [CHAIN_IDS.base]: config.payToEvm,
  };
  for (const chain of config.chains) {
    if (chain === "solana" || chain === "solana_devnet") {
      map[CHAIN_IDS[chain]] = config.payTo;
    } else if (chain === "base" || chain === "polygon" || chain === "base_sepolia") {
      map[CHAIN_IDS[chain]] = config.payToEvm;
    }
  }
  return map;
}

function syncResourceUrl(parsed: Record<string, unknown>, req: Request): void {
  const resource = parsed.resource as { url?: string } | undefined;
  if (resource) {
    resource.url = resolvePaidResourceUrl(req);
  }
}

const PAID_REQUEST_BUDGET_MS = Number(process.env.PAID_REQUEST_TIMEOUT_MS ?? 70_000);

const baseMiddleware = {
  payTo: resolvePayTo(),
  facilitatorUrl: config.facilitatorUrl,
  network: [...config.networks],
  onSettlement: (info: { transaction?: string; payer?: string; network?: string }) => {
    logger.info({ tx: info.transaction, payer: info.payer, network: info.network }, "[x402] settled");
  },
};

type PaidMw = ReturnType<typeof x402Middleware>;

function withPaidRequestBudget(handler: PaidMw): PaidMw {
  return async (req, res, next) => {
    guardResponseWrites(res);
    let done = false;
    const timer = setTimeout(() => {
      if (done || isResponseLocked(res)) return;
      logger.error({ budgetMs: PAID_REQUEST_BUDGET_MS, path: req.path }, "[x402-paid] request budget exceeded");
      lockResponse(res);
      res.status(504).json({
        error: "Payment settlement or handler timed out",
        code: "gateway_timeout",
        budgetMs: PAID_REQUEST_BUDGET_MS,
        hint: "Raise X402_FACILITATOR_TIMEOUT_MS=90000 on Railway if settlements fail with facilitator_timeout.",
      });
    }, PAID_REQUEST_BUDGET_MS);

    try {
      await handler(req, res, next);
    } catch (err) {
      if (!isResponseLocked(res)) next(err);
      else logger.error({ err: err instanceof Error ? err.message : String(err) }, "[x402-paid] error after response locked");
    } finally {
      done = true;
      clearTimeout(timer);
    }
  };
}

function attachBazaarToPayload(parsed: Record<string, unknown>, req: Request): void {
  const bazaar = bazaarExtensionForRequest(req);
  const extensions = (parsed.extensions as Record<string, unknown> | undefined) ?? {};
  parsed.extensions = { ...extensions, bazaar };
  if (parsed.x402Version == null) parsed.x402Version = 2;
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
    if (!isAllowedNetwork(accept.network)) continue;
    if (accept.payTo && !isTrustedPayTo(accept.payTo)) continue;
    enrichAcceptFromFacilitator(accept);
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
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[x402-paid] injectBazaarExtension failed");
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
      onSettlement: (info) => {
        incCounter("x402_settlements");
        const store = paymentRequestAls.getStore();
        const pending = store?.x402PendingNonce;
        if (pending) {
          void markNonceUsed(pending.nonce, pending.network).catch((err) => {
            logger.error({ err: err instanceof Error ? err.message : String(err) }, "[x402-paid] markNonceUsed failed");
          });
        }
        if (store) {
          void markIdempotencyKeyUsed(store, store.path).catch((err) => {
            logger.error({ err: err instanceof Error ? err.message : String(err) }, "[x402-paid] idempotency mark failed");
          });
        }
        baseMiddleware.onSettlement(info);
      },
    });

    const paidHandler: PaidMw = async (req: Request, res: Response, next: NextFunction) => {
      if (process.env.X402_BYPASS === "1") {
        next();
        return;
      }
      const paymentSig = getPaymentSignatureHeader(req);
      if (!paymentSig) {
        try {
          await ensureFacilitatorExtras();
        } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[x402-paid] facilitator extras cache refresh failed");
        }
      }

      const paymentReq = req as PaymentRequestStore;
      if (paymentSig && isIdempotencyKeyConsumed(req, req.path)) {
        incCounter("idempotency_replay");
        res.status(409).json({
          error: "Idempotency-Key already fulfilled for this resource — use a new key",
        });
        return;
      }

      if (paymentSig) {
        const { nonce, network, payTo } = extractNonceFromPaymentHeader(paymentSig);
        if (payTo && !isTrustedPayTo(payTo)) {
          res.status(403).json({
            error: "Payment address mismatch — possible payTo redirect attack",
          });
          return;
        }
        if (network && !isAllowedNetwork(network)) {
          res.status(403).json({ error: `Network not allowed: ${network}` });
          return;
        }
        if (nonce) {
          if (isNonceAlreadyUsed(nonce)) {
            incCounter("replay_blocked");
            res.status(409).json({ error: "Replay attack detected: nonce already used" });
            return;
          }
          paymentReq.x402PendingNonce = { nonce, network: network ?? "unknown" };
        }
      }

      const origJson = res.json.bind(res);
      res.json = ((body?: unknown) => {
        if (isResponseLocked(res)) return res;
        if (body && typeof body === "object") {
          const payload = body as Record<string, unknown>;
          if (
            res.statusCode === 402 &&
            payload.error === "Payment settlement failed" &&
            payload.reason
          ) {
            incCounter("x402_settlement_failures");
            logSettlementFailure({
              reason: String(payload.reason),
              walletAddress: typeof payload.payer === "string" ? payload.payer : undefined,
              amountUsdc: typeof payload.amount === "string" ? payload.amount : undefined,
              network: typeof payload.network === "string" ? payload.network : undefined,
              endpoint: req.path,
            });
            const circuit = checkCircuitBreaker();
            if (!res.headersSent) {
              res.setHeader("Retry-After", String(process.env.SETTLEMENT_RETRY_AFTER_SEC ?? "15"));
              if (circuit.open) {
                res.setHeader("X-Circuit-Breaker", "open");
                res.setHeader("X-Failover-Hint", "settlement-failures-threshold-exceeded");
              }
            }
            if (circuit.open) {
              logger.warn({ circuit }, "[x402] circuit breaker open — too many settlement failures");
            }
            logger.error({ reason: payload.reason, circuit: circuit.open }, "[x402] settlement failed");
            payload.error = `Payment settlement failed (${payload.reason})`;
            if (circuit.open) {
              (payload as Record<string, unknown>).circuitBreaker = "open";
              (payload as Record<string, unknown>).failoverHint = circuit.hint;
            }
          }
        }
        if (bodyHasAccepts(body)) {
          const payload = body as Record<string, unknown>;
          normalizeAccepts(payload);
          attachBazaarToPayload(payload, req);
          syncResourceUrl(payload, req);
          const message =
            typeof payload.error === "string" ? payload.error : "Payment required";
          const out: Record<string, unknown> = { error: message };
          if (typeof payload.reason === "string") out.reason = payload.reason;
          return origJson(out);
        }
        return origJson(body);
      }) as typeof res.json;

      const origSetHeader = res.setHeader.bind(res);
      res.setHeader = ((name: string, value: string | number | readonly string[]) => {
        if (isResponseLocked(res)) return res;
        let headerValue = value;
        if (name.toUpperCase() === PAYMENT_REQUIRED && typeof headerValue === "string") {
          headerValue = injectBazaarExtension(headerValue, req);
        }
        return origSetHeader(name, headerValue);
      }) as typeof res.setHeader;

      try {
        await paymentRequestAls.run(paymentReq, async () => {
          await inner(req, res, next);
        });
      } catch (err) {
        if (!isResponseLocked(res)) next(err);
        else logger.error({ err: err instanceof Error ? err.message : String(err) }, "[x402-paid] inner error after response locked");
      }
    };

    return withPaidRequestBudget(paidHandler);
  };
}
