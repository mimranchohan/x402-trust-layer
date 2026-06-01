import { encodeFunctionData, type Address, type Hex } from "viem";
import { config } from "../../config.js";
import {
  DEFAULT_IDENTITY_REGISTRY,
  DEFAULT_REPUTATION_REGISTRY,
  ERC8004_CHAIN_ID,
} from "./constants.js";

const identityRegistryAbi = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgentWallet",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const reputationRegistryAbi = [
  {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    name: "getSummary",
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function ethCall(to: Address, data: Hex): Promise<Hex | null> {
  const res = await fetch(config.baseRpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result?: Hex; error?: unknown };
  if (!json.result || json.result === "0x") return null;
  return json.result;
}

function decodeAddress(result: Hex): Address | null {
  if (result.length < 66) return null;
  return (`0x${result.slice(-40)}` as Address);
}

function decodeUint256(result: Hex): bigint {
  return BigInt(result);
}

function decodeString(result: Hex): string | null {
  try {
    const hex = result.slice(2);
    if (hex.length < 128) return null;
    const offset = Number(BigInt(`0x${hex.slice(0, 64)}`)) * 2;
    const len = Number(BigInt(`0x${hex.slice(offset, offset + 64)}`));
    const data = hex.slice(offset + 64, offset + 64 + len * 2);
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = parseInt(data.slice(i * 2, i * 2 + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function decodeSummary(result: Hex): ReputationSummary | null {
  try {
    const hex = result.slice(2);
    if (hex.length < 192) return null;
    const count = BigInt(`0x${hex.slice(0, 64)}`);
    const summaryValue = BigInt(`0x${hex.slice(64, 128)}`);
    const summaryValueDecimals = Number(BigInt(`0x${hex.slice(128, 192)}`));
    return { count, summaryValue, summaryValueDecimals };
  } catch {
    return null;
  }
}

export function identityRegistryAddress(): Address {
  return (config.erc8004IdentityRegistry || DEFAULT_IDENTITY_REGISTRY) as Address;
}

export function reputationRegistryAddress(): Address {
  return (config.erc8004ReputationRegistry || DEFAULT_REPUTATION_REGISTRY) as Address;
}

export async function readOwnerOf(agentId: bigint): Promise<Address | null> {
  const data = encodeFunctionData({
    abi: identityRegistryAbi,
    functionName: "ownerOf",
    args: [agentId],
  });
  const result = await ethCall(identityRegistryAddress(), data);
  return result ? decodeAddress(result) : null;
}

export async function readTokenUri(agentId: bigint): Promise<string | null> {
  const data = encodeFunctionData({
    abi: identityRegistryAbi,
    functionName: "tokenURI",
    args: [agentId],
  });
  const result = await ethCall(identityRegistryAddress(), data);
  return result ? decodeString(result) : null;
}

export async function readAgentWallet(agentId: bigint): Promise<Address | null> {
  const data = encodeFunctionData({
    abi: identityRegistryAbi,
    functionName: "getAgentWallet",
    args: [agentId],
  });
  const result = await ethCall(identityRegistryAddress(), data);
  const wallet = result ? decodeAddress(result) : null;
  if (!wallet || wallet === "0x0000000000000000000000000000000000000000") return null;
  return wallet;
}

export async function readBalanceOf(wallet: Address): Promise<bigint> {
  const data = encodeFunctionData({
    abi: identityRegistryAbi,
    functionName: "balanceOf",
    args: [wallet],
  });
  const result = await ethCall(identityRegistryAddress(), data);
  return result ? decodeUint256(result) : 0n;
}

export type ReputationSummary = {
  count: bigint;
  summaryValue: bigint;
  summaryValueDecimals: number;
};

export async function readReputationSummary(agentId: bigint): Promise<ReputationSummary | null> {
  const data = encodeFunctionData({
    abi: reputationRegistryAbi,
    functionName: "getSummary",
    args: [agentId, [], "", ""],
  });
  const result = await ethCall(reputationRegistryAddress(), data);
  return result ? decodeSummary(result) : null;
}

export function chainMeta() {
  return {
    caip2: "eip155:8453" as const,
    chainId: ERC8004_CHAIN_ID,
    identityRegistry: identityRegistryAddress(),
    reputationRegistry: reputationRegistryAddress(),
  };
}
