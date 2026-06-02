import { sha256Hex } from "./crypto.js";
import { readProtocolStore, writeProtocolStore } from "./store.js";

export type FraudScanInput = {
  agentId?: string;
  walletAddress?: string;
  merchantHost?: string;
  transactionHashes?: string[];
  amountUsdc?: number;
  peerWallets?: string[];
};

export type FraudScanResult = {
  fraudScore: number;
  riskScore: number;
  confidence: number;
  signals: Array<{ code: string; severity: "low" | "medium" | "high"; detail: string }>;
  graph: {
    nodes: number;
    edges: number;
    circularPaymentDetected: boolean;
    washTradingSuspected: boolean;
    walletClusterSuspected: boolean;
  };
  recommendation: string;
};

type GraphStore = {
  wallets: Record<string, { peers: string[]; volumeUsdc: number; txCount: number }>;
};

export async function runFraudScan(input: FraudScanInput): Promise<FraudScanResult> {
  const graph = await readProtocolStore<GraphStore>("fraud-graph", { wallets: {} });
  const signals: FraudScanResult["signals"] = [];
  let fraudScore = 8;
  let riskScore = 12;

  const wallet = input.walletAddress?.toLowerCase();
  if (wallet) {
    const entry = graph.wallets[wallet] ?? { peers: [], volumeUsdc: 0, txCount: 0 };
    entry.txCount += 1;
    entry.volumeUsdc += input.amountUsdc ?? 0;
    for (const peer of input.peerWallets ?? []) {
      if (!entry.peers.includes(peer)) entry.peers.push(peer);
    }
    graph.wallets[wallet] = entry;
    await writeProtocolStore("fraud-graph", graph);

    if (entry.peers.length > 8 && entry.volumeUsdc < 1) {
      signals.push({
        code: "WALLET_CLUSTER_LOW_VALUE",
        severity: "high",
        detail: "Many peers with low aggregate volume — possible Sybil cluster",
      });
      fraudScore += 35;
      riskScore += 30;
    }
  }

  const hashes = input.transactionHashes ?? [];
  if (hashes.length >= 3) {
    const unique = new Set(hashes.map((h) => h.slice(0, 12)));
    if (unique.size <= 1) {
      signals.push({
        code: "CIRCULAR_OR_REPEATED_TX",
        severity: "high",
        detail: "Repeated transaction hash prefix pattern",
      });
      fraudScore += 28;
    }
  }

  if ((input.amountUsdc ?? 0) > 0 && (input.amountUsdc ?? 0) < 0.02 && hashes.length > 5) {
    signals.push({
      code: "WASH_MICRO_PAYMENTS",
      severity: "medium",
      detail: "High txn count with micro amounts",
    });
    fraudScore += 22;
  }

  const circularPaymentDetected = signals.some((s) => s.code === "CIRCULAR_OR_REPEATED_TX");
  const washTradingSuspected = signals.some((s) => s.code === "WASH_MICRO_PAYMENTS");
  const walletClusterSuspected = signals.some((s) => s.code === "WALLET_CLUSTER_LOW_VALUE");

  fraudScore = Math.min(100, fraudScore);
  riskScore = Math.min(100, Math.max(fraudScore, riskScore));

  const nodeSet = new Set(Object.keys(graph.wallets));
  const edgeCount = Object.values(graph.wallets).reduce((a, w) => a + w.peers.length, 0);

  return {
    fraudScore,
    riskScore,
    confidence: signals.length ? 0.78 : 0.55,
    signals,
    graph: {
      nodes: nodeSet.size,
      edges: edgeCount,
      circularPaymentDetected,
      washTradingSuspected,
      walletClusterSuspected,
    },
    recommendation:
      fraudScore >= 50
        ? "Block or require manual review before x402 settlement"
        : fraudScore >= 25
          ? "Require escrow + elevated guard caps"
          : "Proceed with standard pre-x402 guard",
  };
}

export function fingerprintAgent(agentId: string, wallet?: string): string {
  return sha256Hex(`${agentId}:${wallet ?? ""}`).slice(0, 20);
}
