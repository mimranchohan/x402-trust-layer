import {
  createEvmKeypairWallet,
  createKeypairWallet,
  type WrapFetchOptions,
} from "@dexterai/x402/client";
import { CHAIN_IDS } from "./chains.js";

/** Public mainnet RPC — Dexter proxy can return shapes web3.js 1.98 cannot parse */
export const DEFAULT_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

function preferredPaymentNetwork(): string | undefined {
  const explicit = process.env.X402_PREFERRED_NETWORK?.trim();
  if (explicit) return explicit;

  const nets = (process.env.NETWORKS ?? process.env.NETWORK ?? "base,solana").toLowerCase();
  if (nets.split(",").map((s) => s.trim()).includes("base")) {
    return CHAIN_IDS.base;
  }
  return CHAIN_IDS.solana;
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

  if (evmKey && solKey) {
    opts.preferredNetwork = preferredPaymentNetwork();
  } else if (evmKey) {
    opts.preferredNetwork = CHAIN_IDS.base;
  }

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
