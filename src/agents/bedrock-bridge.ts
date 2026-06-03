import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { parseWithVerifierFallback } from "../lib/parse-with-verifier-fallback.js";

const bedrockSchema = z.object({
  actionGroup: z.string().optional(),
  apiPath: z.string().optional(),
  requestBody: z
    .object({
      content: z
        .record(
          z.object({
            properties: z.record(z.unknown()).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

function extractBedrockProperties(body: z.infer<typeof bedrockSchema>): Record<string, unknown> {
  const content = body.requestBody?.content;
  if (!content) return {};
  const json = content["application/json"];
  return (json?.properties as Record<string, unknown>) ?? {};
}

/** AWS Bedrock AgentCore action-group → Trust Layer guard preflight. */
export async function handleBedrockPreflight(req: Request, res: Response): Promise<void> {
  const parsed = parseWithVerifierFallback("/api/bedrock/preflight", bedrockSchema, req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const params = extractBedrockProperties(parsed.data);
  const upstream = await fetch(`${config.publicBaseUrl}/api/guard/pre-x402`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: String(params.agentId ?? "bedrock-agent"),
      walletAddress: String(params.walletAddress ?? config.payToEvm ?? config.payTo),
      targetUrl: String(params.targetUrl ?? config.publicBaseUrl),
      estimatedCostUsdc: Number(params.estimatedCostUsdc ?? 0.05),
      policy: (params.policy as Record<string, unknown>) ?? {
        dailyCapUsdc: 50,
        perCallCapUsdc: 1,
        allowedHosts: ["*"],
      },
    }),
  });

  const result = await upstream.json();
  res.json({
    messageVersion: "1.0",
    response: {
      actionGroup: parsed.data.actionGroup ?? "TrustLayerGuard",
      apiPath: parsed.data.apiPath ?? "/guard/pre-x402",
      httpMethod: "POST",
      httpStatusCode: upstream.status,
      responseBody: {
        "application/json": { body: JSON.stringify(result) },
      },
    },
  });
}
