export type Policy = {
  dailyCapUsdc: number;
  perCallCapUsdc: number;
  allowedHosts?: string[];
  blockedHosts?: string[];
  allowedNetworks?: string[];
};

export type SpendGovernorInput = {
  agentId: string;
  estimatedCostUsdc: number;
  targetUrl?: string;
  network?: string;
  policy: Policy;
};

export type SpendGovernorResult = {
  allowed: boolean;
  reason: string;
  spentTodayUsdc: number;
  remainingDailyUsdc: number;
  perCallCapUsdc: number;
};

export type ReceiptAuditorInput = {
  transactionHash?: string;
  network: string;
  expectedAmountUsdc?: number;
  payTo?: string;
  settlement?: {
    transaction?: string;
    payer?: string;
    amountUsdc?: number;
    network?: string;
  };
};

export type RiskGateInput = {
  targetUrl: string;
  estimatedCostUsdc?: number;
  policy?: {
    perCallCapUsdc?: number;
    blockedHosts?: string[];
  };
};

export type RouterInput = {
  query: string;
  preferNetwork?: string;
  maxPriceUsdc?: number;
  execute?: boolean;
};

export type ResearchInput = {
  topic: string;
  includePrice?: boolean;
  language?: string;
};

export type MarketplaceResource = {
  name?: string;
  url?: string;
  description?: string;
  qualityScore?: number;
  priceUsdc?: number;
  network?: string;
  host?: string;
  latencyP50Ms?: number;
  tags?: string[];
};
