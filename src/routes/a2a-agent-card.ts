import { createHmac } from "node:crypto";
import type { Express } from "express";
import { config, pricing } from "../config.js";
import {
  CHAIN_IDS,
  availableStablecoins,
  type ChainKey,
} from "../lib/chains.js";
import {
  DEFAULT_IDENTITY_REGISTRY,
  DEFAULT_REPUTATION_REGISTRY,
} from "../lib/erc8004/constants.js";
import { listEndpoints } from "./catalog.js";
import { SUITE_VERSION } from "../lib/version.js";

/** Sign a JSON string body for A2A v1.2 agent card integrity. */
function signAgentCard(body: string): string {
  return createHmac("sha256", config.attestationHmacSecret)
    .update(body)
    .digest("base64url");
}

/**
 * Build the x402 V2 `accepts` array for the discovery document.
 * Lists all configured chains x all available stablecoin rails.
 */
function buildAccepts(): Array<{
  network: string;
  asset: string;
  assetName: string;
  minAmount: string;
  maxAmount: string;
}> {
  const out: Array<{
    network: string;
    asset: string;
    assetName: string;
    minAmount: string;
    maxAmount: string;
  }> = [];
  for (const chain of config.chains) {
    const caip2 = CHAIN_IDS[chain as ChainKey];
    if (!caip2) continue;
    for (const { rail, asset } of availableStablecoins(chain as ChainKey)) {
      out.push({
        network: caip2,
        asset,
        assetName: rail,
        minAmount: "0.01",
        maxAmount: "0.50",
      });
    }
  }
  return out;
}

/**
 * Google A2A v1.2 Agent Card discovery (/.well-known/agent.json).
 * Changes vs 0.2.6:
 *   - protocolVersion bumped to "1.2"
 *   - Response signed with x-agent-card-signature HMAC header
 *   - provider / iconUrl / supportsAuthenticatedExtendedCard fields added
 *   - defaultInputModes / defaultOutputModes at top level (A2A v1.2 spec)
 */
export function registerA2AAgentCard(app: Express): void {
  // -- /.well-known/agent.json -----------------------------------------------
  app.get("/.well-known/agent.json", (_req, res) => {
    const skills = listEndpoints().map((e) => {
      const [, routePath] = e.path.split(" ");
      return {
        id: routePath.replace(/[^a-z0-9]/gi, "_").slice(1),
        name: routePath,
        description: `${e.price} USDC -- ${e.tier} tier`,
        inputModes: ["application/json"],
        outputModes: ["application/json"],
        tags: ["x402", "payment", "trust", e.tier],
      };
    });

    const card = {
      // A2A v1.2 required fields
      name: "x402 Trust Layer",
      description:
        "55+ paid trust APIs for AI agents -- identity, attestation, settlement, escrow, compliance. x402 V2 protocol. Wallet sessions supported.",
      url: config.publicBaseUrl,
      iconUrl: `${config.publicBaseUrl}/logo.png`,
      version: SUITE_VERSION,
      protocolVersion: "1.2",
      provider: {
        organization: "x402 Trust Layer",
        url: "https://x402trustlayer.xyz",
      },
      // Authentication
      supportsAuthenticatedExtendedCard: false,
      authentication: {
        schemes: ["x402-payment"],
        description:
          "Pay with x402 V2 micropayments (USDC / EURC / PYUSD / USDT). " +
          "Wallet sessions available: pay once, call many times.",
      },
      // Capabilities (A2A v1.2)
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
      // x402 V2 payment info (discoverable by x402-aware orchestrators)
      x402: {
        protocolVersion: "2.0",
        walletSessions: {
          supported: true,
          createEndpoint: `${config.publicBaseUrl}/api/session/create`,
          price: pricing.walletSessionCreate,
          hint: "Pay once, include x-session-token header on subsequent calls",
        },
        discovery: `${config.publicBaseUrl}/.well-known/x402.json`,
      },
      // ERC-8004 trust info
      erc8004: {
        caip2: "eip155:8453",
        identityRegistry: config.erc8004IdentityRegistry || DEFAULT_IDENTITY_REGISTRY,
        reputationRegistry: config.erc8004ReputationRegistry || DEFAULT_REPUTATION_REGISTRY,
      },
      // Skills
      skills,
    };

    const body = JSON.stringify(card);
    const sig = signAgentCard(body);

    res
      .setHeader("Content-Type", "application/json")
      .setHeader("x-agent-card-signature", `hmac-sha256=${sig}`)
      .setHeader("Cache-Control", "public, max-age=60")
      .end(body);
  });

  // -- /.well-known/x402.json -------------------------------------------------
  // x402 V2 protocol discovery endpoint.
  // Orchestrators and wallets read this to learn which networks/stablecoins
  // are accepted, where to create wallet sessions, and where the agent card is.
  app.get("/.well-known/x402.json", (_req, res) => {
    const networks = config.chains
      .map((c) => CHAIN_IDS[c as ChainKey])
      .filter(Boolean) as string[];

    const discovery = {
      version: "2.0",
      paymentRequired: true,
      networks,
      accepts: buildAccepts(),
      payTo: config.payTo || config.payToEvm,
      // Wallet sessions -- pay once, reuse for TTL
      walletSessions: {
        supported: true,
        endpoint: `${config.publicBaseUrl}/api/session/create`,
        verifyEndpoint: `${config.publicBaseUrl}/api/session/verify`,
        revokeEndpoint: `${config.publicBaseUrl}/api/session/revoke`,
        sessionPrice: pricing.walletSessionCreate,
        verifyPrice: pricing.walletSessionVerify,
        maxTtlSeconds: 604800,
        hint: "POST /api/session/create with x402 payment to receive x-session-token. Send token header on all subsequent calls to bypass per-call settlement.",
      },
      // Agent identity
      agentCard: `${config.publicBaseUrl}/.well-known/agent.json`,
      // ERC-8004 on-chain identity
      erc8004: {
        caip2: "eip155:8453",
        identityRegistry: config.erc8004IdentityRegistry || DEFAULT_IDENTITY_REGISTRY,
        reputationRegistry: config.erc8004ReputationRegistry || DEFAULT_REPUTATION_REGISTRY,
        trustScoreEndpoint: `${config.publicBaseUrl}/api/protocol/trust-score-v2`,
      },
      // Multi-stablecoin rail info
      stablecoins: {
        primary: "USDC",
        supported: ["USDC", "EURC", "PYUSD", "USDT"],
        euMiCA: "EURC",
        note: "EURC preferred for EU/SEPA MiCA compliance. PYUSD for Stripe/PayPal regulated flows. USDT tertiary.",
      },
    };

    res
      .setHeader("Content-Type", "application/json")
      .setHeader("Cache-Control", "public, max-age=300")
      .json(discovery);
  });
}
