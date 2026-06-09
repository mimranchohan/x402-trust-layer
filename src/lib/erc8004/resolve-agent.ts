import type { Address } from "viem";
import { config } from "../../config.js";
import { identityRegistryAddress, readBalanceOf, readOwnerOf } from "./registry.js";

export type AgentResolution = {
  agentId: bigint | null;
  source: "body" | "alchemy" | "none";
  guidance: string | null;
};

type AlchemyNft = { tokenId?: string };

async function resolveViaAlchemy(wallet: Address): Promise<bigint | null> {
  const apiKey = config.alchemyApiKey;
  if (!apiKey) return null;

  const registry = identityRegistryAddress();
  const url = new URL(`https://base-mainnet.g.alchemy.com/nft/v3/${apiKey}/getNFTsForOwner`);
  url.searchParams.set("owner", wallet);
  url.searchParams.append("contractAddresses[]", registry);
  url.searchParams.set("withMetadata", "false");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const json = (await res.json()) as { ownedNfts?: AlchemyNft[] };
  const first = json.ownedNfts?.[0];
  if (!first?.tokenId) return null;

  try {
    return BigInt(first.tokenId);
  } catch {
    return null;
  }
}

export async function resolveAgentId(
  wallet: Address,
  agentIdInput?: string | number | bigint,
): Promise<AgentResolution> {
  if (agentIdInput != null && agentIdInput !== "") {
    try {
      const agentId = BigInt(agentIdInput);
      const owner = await readOwnerOf(agentId);
      if (owner && owner.toLowerCase() === wallet.toLowerCase()) {
        return { agentId, source: "body", guidance: null };
      }
      if (owner) {
        return {
          agentId: null,
          source: "body",
          guidance: `agentId ${agentId} is owned by ${owner}, not ${wallet}`,
        };
      }
      return {
        agentId: null,
        source: "body",
        guidance: `agentId ${agentId} not found on ERC-8004 IdentityRegistry`,
      };
    } catch {
      return { agentId: null, source: "body", guidance: "Invalid agentId in request body" };
    }
  }

  const balance = await readBalanceOf(wallet);
  if (balance === 0n) {
    return {
      agentId: null,
      source: "none",
      guidance: config.alchemyApiKey
        ? "No ERC-8004 agent NFT found for this wallet on Base mainnet"
        : "Provide agentId in body or set ALCHEMY_API_KEY for wallet→agentId NFT lookup",
    };
  }

  const fromAlchemy = await resolveViaAlchemy(wallet);
  if (fromAlchemy != null) {
    return { agentId: fromAlchemy, source: "alchemy", guidance: null };
  }

  return {
    agentId: null,
    source: "none",
    guidance:
      "Wallet holds ERC-8004 NFT(s) but agentId could not be resolved — pass agentId explicitly or configure ALCHEMY_API_KEY",
  };
}
