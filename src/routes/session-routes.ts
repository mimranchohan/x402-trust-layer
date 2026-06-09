/**
 * Wallet Session routes (x402 V2).
 *
 * POST /api/session/create   — paid endpoint; mints a signed session token
 * GET  /api/session/verify   — paid (cheap); validate token + remaining TTL
 * DELETE /api/session/revoke — paid (cheap); revoke a session early
 */

import type { Request, Response } from "express";
import { z } from "zod";
import {
  createWalletSession,
  verifyWalletSession,
  revokeWalletSession,
  getWalletSessionInfo,
} from "../lib/wallet-sessions.js";
import { pricing } from "../config.js";
import { createPost, createGet, type RouteContext } from "./shared.js";

const createSchema = z.object({
  walletAddress: z.string().min(16).max(128),
  agentId: z.union([z.string(), z.number()]).optional(),
  network: z.string().min(2).max(64).default("eip155:8453"),
  stablecoin: z.enum(["USDC", "EURC", "PYUSD", "USDT"]).optional().default("USDC"),
  ttlSeconds: z.number().int().min(60).max(604_800).optional(),
  maxCalls: z.number().int().min(1).max(100_000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const tokenSchema = z.object({
  token: z.string().min(10).max(512),
});

export function registerSessionRoutes(ctx: RouteContext): void {
  const post = createPost(ctx);
  const get = createGet(ctx);
  const { app, asyncRoute } = ctx;

  // ── POST /api/session/create ─────────────────────────────────────────────
  post(
    "/api/session/create",
    pricing.walletSessionCreate,
    "x402 V2 wallet session — pay once, skip per-call settlement for TTL duration",
    async (req: Request, res: Response) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_input",
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const data = parsed.data;
      const { token, session } = createWalletSession({
        walletAddress: data.walletAddress,
        agentId: data.agentId != null ? String(data.agentId) : undefined,
        network: data.network,
        stablecoin: data.stablecoin,
        amountPaid: pricing.walletSessionCreate,
        ttlSeconds: data.ttlSeconds,
        maxCalls: data.maxCalls,
        metadata: data.metadata as Record<string, unknown> | undefined,
      });

      res.json({
        ok: true,
        token,
        sessionId: session.sessionId,
        walletAddress: session.walletAddress,
        network: session.network,
        stablecoin: session.stablecoin,
        expiresAt: session.expiresAt,
        ttlSeconds: session.expiresAt - session.createdAt,
        maxCalls: session.maxCalls,
        usage: {
          protocol: "x402-v2-wallet-session",
          hint: "Send header `x-session-token: <token>` on subsequent requests to bypass per-call payment",
        },
      });
    },
  );

  // ── GET /api/session/verify ───────────────────────────────────────────────
  get(
    "/api/session/verify",
    pricing.walletSessionVerify,
    "Verify x402 V2 wallet session token — returns validity + remaining TTL + call count",
    async (req: Request, res: Response) => {
      const tokenHeader = req.headers["x-session-token"];
      const tokenQuery = req.query["token"];
      const rawToken =
        typeof tokenHeader === "string"
          ? tokenHeader
          : typeof tokenQuery === "string"
            ? tokenQuery
            : undefined;

      if (!rawToken) {
        res.status(400).json({
          error: "missing_token",
          hint: "Send `x-session-token: <token>` header or `?token=<token>` query param",
        });
        return;
      }

      const result = verifyWalletSession(rawToken);

      if (!result.valid) {
        res.status(401).json({
          ok: false,
          valid: false,
          reason: result.reason,
        });
        return;
      }

      res.json({
        ok: true,
        valid: true,
        sessionId: result.session.sessionId,
        walletAddress: result.session.walletAddress,
        agentId: result.session.agentId,
        network: result.session.network,
        stablecoin: result.session.stablecoin,
        callCount: result.session.callCount,
        maxCalls: result.session.maxCalls,
        remainingCalls: result.remainingCalls,
        remainingTtl: result.remainingTtl,
        expiresAt: result.session.expiresAt,
      });
    },
  );

  // ── DELETE /api/session/revoke ────────────────────────────────────────────
  // Express does not support createGet/createPost for DELETE — register directly
  app.delete(
    "/api/session/revoke",
    asyncRoute(async (req: Request, res: Response) => {
      const tokenHeader = req.headers["x-session-token"];
      const body = tokenSchema.safeParse(req.body);
      const rawToken =
        typeof tokenHeader === "string" ? tokenHeader : body.success ? body.data.token : undefined;

      if (!rawToken) {
        res.status(400).json({
          error: "missing_token",
          hint: "Send `x-session-token` header or `{token}` body",
        });
        return;
      }

      const result = revokeWalletSession(rawToken);

      if (!result.revoked) {
        res.status(400).json({ ok: false, revoked: false, reason: result.reason });
        return;
      }

      res.json({ ok: true, revoked: true });
    }),
  );

  // ── GET /api/session/info (admin / debug, no x402 charge) ─────────────────
  app.get(
    "/api/session/info",
    asyncRoute(async (req: Request, res: Response) => {
      const rawToken =
        typeof req.headers["x-session-token"] === "string"
          ? req.headers["x-session-token"]
          : typeof req.query["token"] === "string"
            ? req.query["token"]
            : undefined;

      if (!rawToken) {
        res.status(400).json({ error: "missing_token" });
        return;
      }

      const session = getWalletSessionInfo(rawToken);
      if (!session) {
        res.status(404).json({ error: "session_not_found_or_invalid_token" });
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      res.json({
        sessionId: session.sessionId,
        walletAddress: session.walletAddress,
        agentId: session.agentId,
        network: session.network,
        stablecoin: session.stablecoin,
        callCount: session.callCount,
        maxCalls: session.maxCalls,
        active: session.revokedAt === null && now < session.expiresAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        createdAt: session.createdAt,
        metadata: session.metadata,
      });
    }),
  );
}
