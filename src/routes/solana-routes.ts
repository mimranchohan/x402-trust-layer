import type { Request, Response } from "express";
import { z } from "zod";
import { getSolanaVerifyAction, postSolanaVerifyAction } from "../agents/solana-actions.js";
import type { RouteContext } from "./shared.js";

export function registerSolanaRoutes(ctx: RouteContext) {
  const { app, asyncRoute } = ctx;

  // Solana Action GET: Returns Blink metadata
  app.get(
    "/api/solana-pay/action/agent-verify",
    asyncRoute(async (req: Request, res: Response) => {
      const address = req.query.address ? String(req.query.address).trim() : undefined;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept-Encoding");
      res.setHeader("X-Action-Version", "2.1.3");
      res.json(await getSolanaVerifyAction(address, baseUrl));
    })
  );

  // Solana Action POST: Builds signature transaction
  app.post(
    "/api/solana-pay/action/agent-verify",
    asyncRoute(async (req: Request, res: Response) => {
      const address = req.query.address ? String(req.query.address).trim() : undefined;
      const parsed = z.object({
        account: z.string().min(32),
      }).safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({ error: parsed.error.flatten() });
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept-Encoding");
      res.setHeader("X-Action-Version", "2.1.3");
      res.json(await postSolanaVerifyAction(parsed.data.account, address));
    })
  );

  // Allow preflight options request for CORS on Solana Actions
  app.options("/api/solana-pay/action/agent-verify", (req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept-Encoding");
    res.setHeader("X-Action-Version", "2.1.3");
    res.sendStatus(200);
  });
}
