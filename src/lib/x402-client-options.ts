import {
  createEvmKeypairWallet,
  createKeypairWallet,
  createX402Client,
  type WrapFetchOptions,
} from "@dexterai/x402/client";
import type { Chain } from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, polygon } from "viem/chains";
import { CHAIN_IDS } from "./chains.js";

const EVM_CHAIN_BY_CAIP2: Record<string, Chain> = {
  [CHAIN_IDS.base]: base,
  [CHAIN_IDS.polygon]: polygon,
};

/** Public mainnet RPC — Dexter proxy can return shapes web3.js 1.98 cannot parse */
export const DEFAULT_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

function resolvePreferredNetwork(hasEvmKey: boolean, hasSolKey: boolean): string | undefined {
  const explicit = process.env.X402_PREFERRED_NETWORK?.trim();
  if (explicit) {
    if (explicit.startsWith("solana:") && !hasSolKey) {
      throw new Error(
        `X402_PREFERRED_NETWORK=${explicit} requires SOLANA_PRIVATE_KEY in .env (demo payer with USDC)`,
      );
    }
    if (explicit.startsWith("eip155:") && !hasEvmKey) {
      throw new Error(
        `X402_PREFERRED_NETWORK=${explicit} requires EVM_PRIVATE_KEY in .env (demo payer with USDC)`,
      );
    }
    return explicit;
  }

  if (hasEvmKey && hasSolKey) {
    const nets = (process.env.NETWORKS ?? process.env.NETWORK ?? "base,solana").toLowerCase();
    if (nets.split(",").map((s) => s.trim()).includes("base")) {
      return CHAIN_IDS.base;
    }
    return CHAIN_IDS.solana;
  }
  if (hasEvmKey) return CHAIN_IDS.base;
  if (hasSolKey) return CHAIN_IDS.solana;
  return undefined;
}

function evmRpcUrl(network: string): string {
  if (network === CHAIN_IDS.polygon) {
    return process.env.POLYGON_RPC_URL?.trim() || "https://polygon-rpc.com";
  }
  return process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org";
}

/**
 * Dexter createEvmKeypairWallet() only exposes signTypedData — Base Permit2 also needs
 * sendTransaction for the one-time USDC → Permit2 approval tx.
 */
export async function createEvmPermit2CapableWallet(
  privateKey: string,
  preferredNetwork: string = CHAIN_IDS.base,
) {
  const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(normalizedKey as `0x${string}`);
  const chain = EVM_CHAIN_BY_CAIP2[preferredNetwork] ?? base;
  const client = createWalletClient({
    account,
    chain,
    transport: http(evmRpcUrl(preferredNetwork)),
  });
  return {
    address: account.address,
    signTypedData: (params: Parameters<typeof account.signTypedData>[0]) =>
      account.signTypedData(params),
    sendTransaction: async (tx: { to: string; data?: string; value?: bigint }) => {
      return client.sendTransaction({
        account,
        chain,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}` | undefined,
        value: tx.value ?? 0n,
      });
    },
  };
}

/** Paid fetch with Permit2-capable EVM wallet (use instead of wrapFetch + evmPrivateKey). */
export async function buildX402Fetch(
  fetchImpl: typeof fetch = fetch,
  overrides?: Partial<WrapFetchOptions>,
): Promise<typeof fetch> {
  const opts = buildWrapFetchOptions(overrides);
  const evmKey = process.env.EVM_PRIVATE_KEY?.trim();
  const solKey = process.env.SOLANA_PRIVATE_KEY?.trim();
  const wallets: {
    solana?: Awaited<ReturnType<typeof createKeypairWallet>>;
    evm?: Awaited<ReturnType<typeof createEvmPermit2CapableWallet>>;
  } = {};

  if (solKey) wallets.solana = await createKeypairWallet(solKey);
  if (evmKey) {
    const evmNet = opts.preferredNetwork ?? CHAIN_IDS.base;
    wallets.evm = await createEvmPermit2CapableWallet(evmKey, evmNet);
  }

  const client = createX402Client({
    wallets,
    preferredNetwork: opts.preferredNetwork as string | undefined,
    rpcUrls: opts.rpcUrls,
    maxAmountAtomic: opts.maxAmountAtomic,
    verbose: opts.verbose,
    fetch: fetchImpl,
    onPaymentRequired: opts.onPaymentRequired,
    accessPass: opts.accessPass,
  });

  return client.fetch.bind(client) as typeof fetch;
}

/** Shared wrapFetch options for demo, scripts, and integrators */
export function buildWrapFetchOptions(overrides?: Partial<WrapFetchOptions>): WrapFetchOptions {
  const evmKey = process.env.EVM_PRIVATE_KEY?.trim();
  const solKey = process.env.SOLANA_PRIVATE_KEY?.trim();
  const solRpc = process.env.SOLANA_RPC_URL?.trim() || DEFAULT_SOLANA_RPC_URL;

  const opts: WrapFetchOptions = {
    rpcUrls: {
      [CHAIN_IDS.solana]: solRpc,
    },
  };

  if (solKey) opts.walletPrivateKey = solKey;
  if (evmKey) opts.evmPrivateKey = evmKey;

  opts.preferredNetwork = resolvePreferredNetwork(!!evmKey, !!solKey);

  if (process.env.X402_VERBOSE === "1" || overrides?.verbose) opts.verbose = true;

  return { ...opts, ...overrides };
}

export function assertPayerKeys(): { evm: boolean; solana: boolean } {
  const evm = !!process.env.EVM_PRIVATE_KEY?.trim();
  const solana = !!process.env.SOLANA_PRIVATE_KEY?.trim();
  if (!evm && !solana) {
    throw new Error(
      "Set EVM_PRIVATE_KEY and/or SOLANA_PRIVATE_KEY in .env (demo payer only — never commit)",
    );
  }
  return { evm, solana };
}

/**
 * Receive wallets (PAY_TO_*) must not be used as demo payers — facilitator rejects self-payment.
 */
export async function assertDemoPayerNotReceiveWallet(): Promise<void> {
  const payToSol = process.env.PAY_TO_ADDRESS?.trim();
  const payToEvm = (process.env.PAY_TO_EVM?.trim() ?? "").toLowerCase();
  const solKey = process.env.SOLANA_PRIVATE_KEY?.trim();
  const evmKey = process.env.EVM_PRIVATE_KEY?.trim();

  if (solKey && payToSol) {
    const wallet = await createKeypairWallet(solKey);
    const pubkey = wallet.publicKey;
    if (!pubkey) {
      throw new Error("SOLANA_PRIVATE_KEY could not be loaded — check key format");
    }
    const payer = pubkey.toBase58();
    if (payer === payToSol) {
      throw new Error(
        `SOLANA_PRIVATE_KEY is your seller receive wallet (${payToSol}). ` +
          "Use a different Solana key with USDC for demo payments, or set EVM_PRIVATE_KEY to a separate Base wallet.",
      );
    }
  }

  if (evmKey && payToEvm) {
    const wallet = await createEvmKeypairWallet(evmKey);
    if (wallet.address.toLowerCase() === payToEvm) {
      throw new Error(
        `EVM_PRIVATE_KEY is your seller receive wallet (${payToEvm}). ` +
          "Use a different Base wallet with USDC for demo payments.",
      );
    }
  }
}
