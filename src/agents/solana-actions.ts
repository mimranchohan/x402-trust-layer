import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { config } from "../config.js";
import { computeTrustScore } from "../lib/erc8004/trust-score.js";
import { logger } from "../lib/logger.js";

// Mainnet connection — SOLANA_RPC_URL should always be set in production.
// The public fallback (api.mainnet-beta.solana.com) is heavily rate-limited
// and will fail under any real load.
const _solanaRpcUrl = process.env.SOLANA_RPC_URL;
const _isProdSolana =
  process.env.NODE_ENV === "production" ||
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_PUBLIC_DOMAIN;
if (_isProdSolana && !_solanaRpcUrl) {
  logger.warn(
    "[solana-actions] SOLANA_RPC_URL not set — using public fallback which is rate-limited. " +
      "Set SOLANA_RPC_URL to a dedicated RPC endpoint (Helius, QuickNode, etc.).",
  );
}
const SOLANA_RPC = _solanaRpcUrl || "https://api.mainnet-beta.solana.com";
const connection = new Connection(SOLANA_RPC);

export type SolanaActionMetadata = {
  icon: string;
  title: string;
  description: string;
  label: string;
  disabled?: boolean;
  links?: {
    actions: Array<{
      label: string;
      href: string;
      parameters?: Array<{
        name: string;
        label: string;
        required?: boolean;
      }>;
    }>;
  };
};

export type SolanaActionPostResponse = {
  transaction: string;
  message?: string;
  redirect?: string;
};

/**
 * GET handler: Returns Solana Action/Blink metadata for agent verification.
 */
export async function getSolanaVerifyAction(
  targetAddress: string | undefined,
  baseUrl: string
): Promise<SolanaActionMetadata> {
  const iconUrl = `${baseUrl.replace(/\/$/, "")}/assets/x402-trustlayer-logo.png`;

  if (!targetAddress) {
    // Return standard parameter request form if no address is supplied yet
    return {
      icon: iconUrl,
      title: "x402 Agent Trust Verification",
      description: "Verify the on-chain reputation tier and trust score of any AI agent or merchant wallet.",
      label: "Verify Agent",
      links: {
        actions: [
          {
            label: "Verify Wallet",
            href: "/api/solana-pay/action/agent-verify?address={address}",
            parameters: [
              {
                name: "address",
                label: "Enter Solana wallet address to verify",
                required: true,
              },
            ],
          },
        ],
      },
    };
  }

  // If address is supplied, compute dynamic description with the agent's trust score
  let score = 50; // default/unregistered fallback
  let tier = "SILVER";
  try {
    const registry = await computeTrustScore({ walletAddress: targetAddress });
    score = registry.trustScore;
    tier = registry.tier;
  } catch {
    // fallback if registry lookup fails
  }

  return {
    icon: iconUrl,
    title: `Agent Verification: ${tier}`,
    description: `Wallet ${targetAddress} is ranked as ${tier} Tier with a Trust Score of ${score}/100 on the x402 Trust Network.`,
    label: "Check Complete",
    disabled: true, // disable action button since the check is complete
  };
}

/**
 * POST handler: Builds fee payment transaction (0.001 SOL) to process agent verification.
 */
export async function postSolanaVerifyAction(
  userAccount: string,
  targetAddress: string | undefined
): Promise<SolanaActionPostResponse> {
  if (!userAccount) {
    throw new Error("Missing user account address");
  }
  const target = targetAddress || userAccount;

  const fromPubkey = new PublicKey(userAccount);
  const toPubkey = new PublicKey(config.payTo); // 9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt (or set by environment)

  // Construct simple lamport transfer as transaction fee (0.001 SOL = 1,000,000 lamports)
  const transaction = new Transaction();
  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: 1_000_000,
    })
  );

  // Fetch blockhash & set fee payer with fallback
  let blockhash: string;
  try {
    const res = await connection.getLatestBlockhash("confirmed");
    blockhash = res.blockhash;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[solana-actions] Custom RPC blockhash fetch failed, trying public fallback");
    try {
      const fallbackConnection = new Connection("https://api.mainnet-beta.solana.com");
      const res = await fallbackConnection.getLatestBlockhash("confirmed");
      blockhash = res.blockhash;
    } catch (fallbackErr) {
      throw new Error(`Failed to retrieve Solana blockhash from both custom and public RPCs: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
    }
  }
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  // Serialize without signing
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  const base64Transaction = serialized.toString("base64");

  return {
    transaction: base64Transaction,
    message: `Payment authorized for checking agent trust score of ${target}`,
  };
}
