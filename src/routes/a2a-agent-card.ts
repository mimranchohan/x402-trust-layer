import type { Express } from "express";
import { config } from "../config.js";
import { listEndpoints } from "./catalog.js";
import { SUITE_VERSION } from "../lib/version.js";

/** Google A2A Agent Card discovery (/.well-known/agent.json). */
export function registerA2AAgentCard(app: Express): void {
  app.get("/.well-known/agent.json", (_req, res) => {
    res.json({
      name: "x402 Trust Layer",
      description: "55 paid trust APIs for AI agents making x402 micropayments",
      url: config.publicBaseUrl,
      version: SUITE_VERSION,
      protocolVersion: "0.2.6",
      capabilities: { streaming: false, pushNotifications: false },
      authentication: { schemes: ["x402-payment"] },
      skills: listEndpoints().map((e) => {
        const [, routePath] = e.path.split(" ");
        return {
          id: routePath.replace(/[^a-z0-9]/gi, "_").slice(1),
          name: routePath,
          description: `${e.price} - ${e.tier} tier`,
          inputModes: ["application/json"],
          outputModes: ["application/json"],
          tags: ["x402", "payment", "trust", e.tier],
        };
      }),
    });
  });
}
