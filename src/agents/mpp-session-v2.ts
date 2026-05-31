import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { CHAIN_IDS, type ChainKey } from "../lib/chains.js";
import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";

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
  status: "ok";
  ok: true;
  success: boolean;
  action: string;
  session: MppSession | null;
  recommendation: string;
  facilitator: { url: string; mppDocs: string };
  nextSteps: string[];
  savingsNote: string;
};

function wrapMpp(
  payload: Omit<MppV2Result, "status" | "ok" | "success"> & { success?: boolean },
): WithAgentTrust<MppV2Result> {
  const success = payload.success ?? payload.session != null;
  const core: MppV2Result = {
    status: "ok",
    ok: true,
    success,
    action: payload.action,
    session: payload.session,
    recommendation: payload.recommendation,
    facilitator: payload.facilitator,
    nextSteps: payload.nextSteps,
    savingsNote: payload.savingsNote,
  };
  const checks = success
    ? ["mpp_session", `action_${payload.action}`]
    : ["mpp_session", "session_not_found"];
  return withAgentTrust(core, agentTrustMeta(checks, {
    confidence: success ? 0.9 : 0.65,
    sources: ["mpp-session-v2", "dexter-facilitator"],
    accuracy_note: "MPP session lifecycle planner; settlement happens client-side via facilitator.",
  }));
}

/** Stateful MPP session planner — open/voucher/close lifecycle with Dexter facilitator */
export async function runMppSessionV2(input: MppV2Input): Promise<WithAgentTrust<MppV2Result>> {
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

    return wrapMpp({
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
      success: true,
    });
  }

  if (input.action === "voucher" || input.action === "status" || input.action === "close") {
    const rows = await loadSessions();
    const session = rows.find((s) => s.sessionId === input.sessionId && s.status === "open") ?? null;
    if (!session) {
      return wrapMpp({
        action: input.action,
        session: null,
        recommendation: "Session not found — call action:open first with expectedCalls and chain",
        facilitator: { url: facilitatorUrl, mppDocs },
        nextSteps: ["Call action:open first"],
        savingsNote: "",
        success: false,
      });
    }

    if (input.action === "voucher") {
      session.callsUsed += 1;
      await saveSessions(rows);
      return wrapMpp({
        action: "voucher",
        session,
        recommendation: "Issue voucher via facilitator MPP channel (client-side)",
        facilitator: { url: facilitatorUrl, mppDocs },
        nextSteps: [
          "Attach sessionId to x402 payment metadata",
          "Do not settle on-chain until session close",
        ],
        savingsNote: `${session.expectedCalls - session.callsUsed} vouchers remaining in plan`,
        success: true,
      });
    }

    if (input.action === "close") {
      session.status = "closed";
      await saveSessions(rows);
      return wrapMpp({
        action: "close",
        session,
        recommendation: "Settle aggregate USDC once on-chain",
        facilitator: { url: facilitatorUrl, mppDocs },
        nextSteps: ["Facilitator settles session total to payTo wallet"],
        savingsNote: `Session used ${session.callsUsed} of ${session.expectedCalls} planned calls`,
        success: true,
      });
    }

    return wrapMpp({
      action: "status",
      session,
      recommendation: session.status,
      facilitator: { url: facilitatorUrl, mppDocs },
      nextSteps: [],
      savingsNote: "",
      success: true,
    });
  }

  return wrapMpp({
    action: input.action,
    session: null,
    recommendation: "Unknown action — use open, voucher, close, or status",
    facilitator: { url: facilitatorUrl, mppDocs },
    nextSteps: ["Use open | voucher | close | status"],
    savingsNote: "",
    success: false,
  });
}
