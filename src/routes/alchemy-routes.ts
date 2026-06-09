import type { Request, Response } from "express";
import { z } from "zod";
import {
  runAlchemyPaymasterPolicy,
  runAlchemyNotifyWebhook,
  runAlchemySimulationShield
} from "../agents/alchemy-policy.js";
import type { RouteContext } from "./shared.js";

export function registerAlchemyRoutes(ctx: RouteContext) {
  const { app, asyncRoute, postHandlers } = ctx;

  const paymasterPolicyHandler = asyncRoute(async (req: Request, res: Response) => {
    const parsed = z.object({
      userOperation: z.object({
        sender: z.string(),
        nonce: z.string(),
        initCode: z.string(),
        callData: z.string(),
        callGasLimit: z.string(),
        verificationGasLimit: z.string(),
        preVerificationGas: z.string(),
        maxFeePerGas: z.string(),
        maxPriorityFeePerGas: z.string(),
        paymasterAndData: z.string(),
        signature: z.string()
      }),
      policyId: z.string(),
      chainId: z.union([z.number(), z.string()]),
      webhookData: z.string().optional()
    }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
    const result = await runAlchemyPaymasterPolicy(parsed.data);
    res.json(result);
  });
  app.post("/api/alchemy/paymaster-policy", paymasterPolicyHandler);
  postHandlers.set("/api/alchemy/paymaster-policy", paymasterPolicyHandler);

  const notifyWebhookHandler = asyncRoute(async (req: Request, res: Response) => {
    // Verify Alchemy webhook HMAC signature if auth token is configured
    const alchemyWebhookToken = process.env.ALCHEMY_WEBHOOK_AUTH_TOKEN;
    if (alchemyWebhookToken) {
      const { createHmac } = await import("node:crypto");
      const sigHeader = req.headers["x-alchemy-signature"] as string | undefined;
      const rawBody = JSON.stringify(req.body);
      const expectedSig = createHmac("sha256", alchemyWebhookToken)
        .update(rawBody)
        .digest("hex");
      if (!sigHeader || sigHeader !== expectedSig) {
        return void res.status(401).json({ error: "Invalid Alchemy webhook signature" });
      }
    }
    const parsed = z.object({
      webhookId: z.string(),
      id: z.string(),
      createdAt: z.string(),
      type: z.string(),
      event: z.object({
        network: z.string(),
        activity: z.array(z.object({
          blockNum: z.string(),
          hash: z.string(),
          fromAddress: z.string(),
          toAddress: z.string(),
          value: z.coerce.number(),
          asset: z.string(),
          category: z.string(),
          rawContract: z.object({
            rawValue: z.string(),
            address: z.string(),
            decimal: z.coerce.number()
          }).optional()
        }))
      })
    }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
    const result = await runAlchemyNotifyWebhook(parsed.data);
    res.json(result);
  });
  app.post("/api/alchemy/notify-webhook", notifyWebhookHandler);
  postHandlers.set("/api/alchemy/notify-webhook", notifyWebhookHandler);

  const simulateShieldHandler = asyncRoute(async (req: Request, res: Response) => {
    const parsed = z.object({
      agentId: z.string(),
      transaction: z.object({
        from: z.string(),
        to: z.string(),
        data: z.string(),
        value: z.string().optional()
      }),
      chainId: z.coerce.number()
    }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.flatten() });
    const result = await runAlchemySimulationShield(parsed.data);
    res.json(result);
  });
  app.post("/api/alchemy/simulate-shield", simulateShieldHandler);
  postHandlers.set("/api/alchemy/simulate-shield", simulateShieldHandler);
}
