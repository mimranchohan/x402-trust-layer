import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { CHAIN_IDS, type ChainKey } from "../lib/chains.js";

export type MppV2Input = {
  action: "open" | "voucher" | "close" | "status";
  sessionId?: string;
  expectedCalls?: number;
  avgPricePerCallUsdc?: number;
  chain?: ChainKey;
  maxBudgetUsdc?: number;
  agentId?: string;
};

export type MppSession = {
  sessionId: string;
  chain: ChainKey;
  agentId: string;
  maxBudgetUsdc: number;
  expectedCalls: number;
  callsUsed: number;
  openedAt: string;
  status: "open" | "closed";
  facilitatorUrl: string;
  estimatedSavingsUsdc: number;
};

const root = path.dirname(fileURLToPath(import.meta.url));
const sessionsPath = path.join(root, "..", "..", "data", "mpp-sessions.json");

async function loadSessions(): Promise<MppSession[]> {
  try {
    const raw = await readFile(sessionsPath, "utf8");
    return JSON.parse(raw) as MppSession[];
  } catch {
    return [];
  }
}

async function saveSessions(rows: MppSession[]): Promise<void> {
  await mkdir(path.dirname(sessionsPath), { recursive: true });
  await writeFile(sessionsPath, JSON.stringify(rows.slice(-200), null, 2), "utf8");
}

export type MppV2Result = {
  action: string;
  session: MppSession | null;
  recommendation: string;
  facilitator: { url: string; mppDocs: string };
  nextSteps: string[];
  savingsNote: string;
};

/** Stateful MPP session planner — open/voucher/close lifecycle with Dexter facilitator */
export async function runMppSessionV2(input: MppV2Input): Promise<MppV2Result> {
  const chain = input.chain ?? "solana";
  const facilitatorUrl = config.facilitatorUrl;
  const mppDocs = "https://docs.dexter.cash/docs/mpp/";

  if (input.action === "open") {
    const expected = input.expectedCalls ?? 20;
    const avg = input.avgPricePerCallUsdc ?? 0.03;
    const perCallTotal = expected * avg;
    const mppTotal = 0.01 + expected * 0.001;
    const savings = Math.max(0, perCallTotal - mppTotal);

    const session: MppSession = {
      sessionId: `mpp_${randomBytes(6).toString("hex")}`,
      chain,
      agentId: input.agentId ?? "anonymous",
      maxBudgetUsdc: input.maxBudgetUsdc ?? perCallTotal,
      expectedCalls: expected,
      callsUsed: 0,
      openedAt: new Date().toISOString(),
      status: "open",
      facilitatorUrl,
      estimatedSavingsUsdc: Number(savings.toFixed(4)),
    };

    const rows = await loadSessions();
    rows.push(session);
    await saveSessions(rows);

    return {
      action: "open",
      session,
      recommendation: savings > 0.05 ? "Use MPP session for this workload" : "Per-call is cheaper",
      facilitator: { url: facilitatorUrl, mppDocs },
      nextSteps: [
        `Point x402 client facilitatorUrl to ${facilitatorUrl}`,
        `Use network ${CHAIN_IDS[chain]} for session channel`,
        `Call action:voucher before each API call in the session`,
        `Call action:close when batch completes`,
      ],
      savingsNote: `Estimated savings $${savings.toFixed(2)} vs ${expected} per-call settlements`,
    };
  }

  if (input.action === "voucher" || input.action === "status" || input.action === "close") {
    const rows = await loadSessions();
    const session = rows.find((s) => s.sessionId === input.sessionId && s.status === "open") ?? null;
    if (!session) {
      return {
        action: input.action,
        session: null,
        recommendation: "Session not found",
        facilitator: { url: facilitatorUrl, mppDocs },
        nextSteps: ["Call action:open first"],
        savingsNote: "",
      };
    }

    if (input.action === "voucher") {
      session.callsUsed += 1;
      await saveSessions(rows);
      return {
        action: "voucher",
        session,
        recommendation: "Issue voucher via facilitator MPP channel (client-side)",
        facilitator: { url: facilitatorUrl, mppDocs },
        nextSteps: [
          "Attach sessionId to x402 payment metadata",
          "Do not settle on-chain until session close",
        ],
        savingsNote: `${session.expectedCalls - session.callsUsed} vouchers remaining in plan`,
      };
    }

    if (input.action === "close") {
      session.status = "closed";
      await saveSessions(rows);
      return {
        action: "close",
        session,
        recommendation: "Settle aggregate USDC once on-chain",
        facilitator: { url: facilitatorUrl, mppDocs },
        nextSteps: ["Facilitator settles session total to payTo wallet"],
        savingsNote: `Session used ${session.callsUsed} of ${session.expectedCalls} planned calls`,
      };
    }

    return {
      action: "status",
      session,
      recommendation: session.status,
      facilitator: { url: facilitatorUrl, mppDocs },
      nextSteps: [],
      savingsNote: "",
    };
  }

  return {
    action: input.action,
    session: null,
    recommendation: "Unknown action",
    facilitator: { url: facilitatorUrl, mppDocs },
    nextSteps: ["Use open | voucher | close | status"],
    savingsNote: "",
  };
}
