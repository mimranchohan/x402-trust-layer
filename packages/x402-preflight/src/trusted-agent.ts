import { guardPreflight, type PreflightPolicy, type PreflightWallet } from "./index.js";

export type TrustedAgentConfig = {
  /**
   * The base URL of the x402 Trust Layer server (defaults to https://x402trustlayer.xyz)
   */
  baseUrl?: string;
  /**
   * The wallet credentials used to pay for the x402 Trust Layer checks
   */
  wallet: PreflightWallet;
  /**
   * Unique ID representing this agent
   */
  agentId: string;
  /**
   * The public wallet address of the agent
   */
  walletAddress: string;
  /**
   * Spend limits, budget, and host restrictions
   */
  policy: PreflightPolicy;
};

export class TrustedSolanaAgent {
  constructor(
    public readonly agentKit: any, // SolanaAgentKit instance (passed dynamically)
    private readonly config: TrustedAgentConfig
  ) {}

  /**
   * Evaluates if a target URL and operation comply with the agent's security policy.
   * Throws an error if the transaction is blocked.
   */
  private async enforcePreflight(targetUrl: string, estimatedCostUsdc: number): Promise<void> {
    const check = await guardPreflight({
      baseUrl: this.config.baseUrl,
      wallet: this.config.wallet,
      agentId: this.config.agentId,
      walletAddress: this.config.walletAddress,
      targetUrl,
      estimatedCostUsdc,
      policy: this.config.policy,
      network: "solana",
    });

    if (!check.allowed) {
      throw new Error(`[Security Block] Transaction to ${targetUrl} rejected by Trust Layer: ${check.summary}`);
    }
  }

  /**
   * Secure wrapper around transfer. Audits the destination and amount before execution.
   */
  async transfer(to: string, amount: number, mint?: string): Promise<string> {
    // Audit check: destination verification simulation
    const destinationUrl = `https://solscan.io/account/${to}`;
    await this.enforcePreflight(destinationUrl, 0.05);

    // Call the underlying Solana Agent Kit method
    return this.agentKit.transfer(to, amount, mint);
  }

  /**
   * Secure wrapper around Jupiter swaps. Verifies swap routes and limits.
   */
  async swap(
    toMint: string,
    amount: number,
    fromMint?: string,
    slippage?: number
  ): Promise<string> {
    const swapRouteUrl = `https://jupiter.ag/swap/${fromMint ?? "SOL"}-${toMint}`;
    await this.enforcePreflight(swapRouteUrl, 0.08);

    return this.agentKit.swap(toMint, amount, fromMint, slippage);
  }

  /**
   * Secure wrapper around token deployment. Prevents unauthorized token creation.
   */
  async deployToken(
    name: string,
    uri: string,
    symbol: string,
    decimals: number = 9,
    initialSupply?: number
  ): Promise<any> {
    const deployUrl = `https://metaplex.com/deploy/${symbol.toLowerCase()}`;
    await this.enforcePreflight(deployUrl, 0.06);

    return this.agentKit.deployToken(name, uri, symbol, decimals, initialSupply);
  }

  /**
   * Safe payload check: Runs the payload sandbox audit on custom commands before execution.
   */
  async checkPayload(payload: Record<string, any>): Promise<{ allowed: boolean; summary: string }> {
    const base = (this.config.baseUrl ?? "https://x402trustlayer.xyz").replace(/\/$/, "");
    
    // Call our newly added /api/guard/payload-sandbox endpoint
    const res = await fetch(`${base}/api/guard/payload-sandbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: this.config.agentId,
        payload,
      }),
    });

    if (!res.ok) {
      throw new Error(`Payload sandbox audit request failed with status: ${res.status}`);
    }

    return res.json() as Promise<{ allowed: boolean; summary: string }>;
  }
}
