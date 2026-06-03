/**
 * Submit x402 Trust Layer manifest to Agent.market (when API is reachable).
 * Usage: npm run register:agent-market
 */
const manifest = {
  name: "x402 Trust Layer",
  description:
    "Guard, Attest, Comply, Audit — paid x402 APIs for autonomous agent payment safety and agent-to-agent orchestration.",
  url: process.env.PUBLIC_BASE_URL ?? "https://x402trustlayer.xyz",
  openapi: `${process.env.PUBLIC_BASE_URL ?? "https://x402trustlayer.xyz"}/openapi.json`,
  x402Discovery: `${process.env.PUBLIC_BASE_URL ?? "https://x402trustlayer.xyz"}/.well-known/x402`,
  categories: ["trust", "compliance", "payments", "identity"],
  priceRange: { min: 0.02, max: 0.45, currency: "USDC" },
  networks: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "eip155:137"],
};

const endpoint = process.env.AGENT_MARKET_REGISTER_URL ?? "https://agent.market/api/register";

try {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  console.log("Agent.market registration:", res.status, body);
  if (!res.ok) process.exit(1);
} catch (err) {
  console.error("Agent.market registration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
