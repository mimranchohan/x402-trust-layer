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
  avgPricePerCallUsdc: number;
  openedAt: string;
  closedAt?: string;
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

export type MppSessionError = {
  code: "SESSION_NOT_FOUND" | "SESSION_ALREADY_CLOSED";
  message: string;
  lookupKey: { agentId?: string; chain?: ChainKey; sessionId?: string };
};

export type MppSettlement = {
  status: "closed" | "already_closed";
  sessionId: string;
  network: string;
  chain: ChainKey;
  agentId: string;
  callsSettled: number;
  plannedCalls: number;
  estimatedTotalUsdc: number;
  facilitatorUrl: string;
};

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
  error?: MppSessionError;
  settlement?: MppSettlement;
  resolvedBy?: "sessionId" | "agentId+chain" | "auto_open";
};

function wrapMpp(
  payload: Omit<MppV2Result, "status" | "ok" | "success"> & { success?: boolean },
): WithAgentTrust<MppV2Result> {
  const success = payload.success ?? (payload.session != null && !payload.error);
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
    ...(payload.error ? { error: payload.error } : {}),
    ...(payload.settlement ? { settlement: payload.settlement } : {}),
    ...(payload.resolvedBy ? { resolvedBy: payload.resolvedBy } : {}),
  };
  const checks = success
    ? ["mpp_session", `action_${payload.action}`, payload.settlement ? "settlement_metadata" : "session_state"]
    : ["mpp_session", payload.error?.code ?? "session_not_found"];
  return withAgentTrust(core, agentTrustMeta(checks, {
    confidence: success ? 0.9 : 0.65,
    sources: ["mpp-session-v2", "dexter-facilitator"],
    accuracy_note: "MPP session lifecycle planner; settlement happens client-side via facilitator.",
  }));
}

function resolveChain(input: MppV2Input): ChainKey {
  return input.chain ?? "solana";
}

function findOpenSession(rows: MppSession[], input: MppV2Input): MppSession | null {
  if (input.sessionId) {
    return rows.find((s) => s.sessionId === input.sessionId && s.status === "open") ?? null;
  }
  if (input.agentId) {
    const chain = resolveChain(input);
    const open = rows.filter(
      (s) => s.agentId === input.agentId && s.chain === chain && s.status === "open",
    );
    return open.length ? open[open.length - 1]! : null;
  }
  return null;
}

function findLatestSession(rows: MppSession[], agentId: string, chain: ChainKey): MppSession | null {
  const matches = rows.filter((s) => s.agentId === agentId && s.chain === chain);
  return matches.length ? matches[matches.length - 1]! : null;
}

function createSession(input: MppV2Input): MppSession {
  const chain = resolveChain(input);
  const expected = input.expectedCalls ?? 20;
  const avg = input.avgPricePerCallUsdc ?? 0.03;
  const perCallTotal = expected * avg;
  const mppTotal = 0.01 + expected * 0.001;
  const savings = Math.max(0, perCallTotal - mppTotal);
  const facilitatorUrl = config.facilitatorUrl;

  return {
    sessionId: `mpp_${randomBytes(6).toString("hex")}`,
    chain,
    agentId: input.agentId ?? "anonymous",
    maxBudgetUsdc: input.maxBudgetUsdc ?? perCallTotal,
    expectedCalls: expected,
    callsUsed: 0,
    avgPricePerCallUsdc: avg,
    openedAt: new Date().toISOString(),
    status: "open",
    facilitatorUrl,
    estimatedSavingsUsdc: Number(savings.toFixed(4)),
  };
}

function buildSettlement(session: MppSession, status: MppSettlement["status"]): MppSettlement {
  const estimatedTotalUsdc = Number(
    (session.callsUsed * session.avgPricePerCallUsdc).toFixed(4),
  );
  return {
    status,
    sessionId: session.sessionId,
    network: CHAIN_IDS[session.chain],
    chain: session.chain,
    agentId: session.agentId,
    callsSettled: session.callsUsed,
    plannedCalls: session.expectedCalls,
    estimatedTotalUsdc,
    facilitatorUrl: session.facilitatorUrl,
  };
}

/** Stateful MPP session planner — open/voucher/close lifecycle with Dexter facilitator */
export async function runMppSessionV2(input: MppV2Input): Promise<WithAgentTrust<MppV2Result>> {
  const chain = resolveChain(input);
  const facilitatorUrl = config.facilitatorUrl;
  const mppDocs = "https://docs.dexter.cash/docs/mpp/";

  if (input.action === "open") {
    const session = createSession(input);
    const rows = await loadSessions();
    rows.push(session);
    await saveSessions(rows);

    return wrapMpp({
      action: "open",
      session,
      recommendation: session.estimatedSavingsUsdc > 0.05 ? "Use MPP session for this workload" : "Per-call is cheaper",
      facilitator: { url: facilitatorUrl, mppDocs },
      nextSteps: [
        `Point x402 client facilitatorUrl to ${facilitatorUrl}`,
        `Use network ${CHAIN_IDS[chain]} for session channel`,
        `Call action:voucher before each API call in the session`,
        `Call action:close when batch completes`,
      ],
      savingsNote: `Estimated savings $${session.estimatedSavingsUsdc.toFixed(2)} vs ${session.expectedCalls} per-call settlements`,
      success: true,
    });
  }

  if (input.action === "voucher" || input.action === "status" || input.action === "close") {
    const rows = await loadSessions();
    let session = findOpenSession(rows, input);
    let resolvedBy: MppV2Result["resolvedBy"];

    if (session) {
      resolvedBy = input.sessionId ? "sessionId" : "agentId+chain";
    }

    if (!session && input.action === "close" && input.agentId) {
      const latest = findLatestSession(rows, input.agentId, chain);
      if (latest?.status === "closed") {
        return wrapMpp({
          action: "close",
          session: latest,
          settlement: buildSettlement(latest, "already_closed"),
          recommendation: "Session already closed — idempotent close acknowledged",
          facilitator: { url: facilitatorUrl, mppDocs },
          nextSteps: ["No further settlement required for this session"],
          savingsNote: `Session ${latest.sessionId} was closed at ${latest.closedAt ?? latest.openedAt}`,
          success: true,
          resolvedBy: "agentId+chain",
        });
      }

      if (input.expectedCalls != null || input.avgPricePerCallUsdc != null) {
        session = createSession(input);
        rows.push(session);
        resolvedBy = "auto_open";
      }
    }

    if (!session) {
      const lookupKey = {
        agentId: input.agentId,
        chain,
        sessionId: input.sessionId,
      };
      return wrapMpp({
        action: input.action,
        session: null,
        error: {
          code: "SESSION_NOT_FOUND",
          message: "No open MPP session matched the lookup key — call action:open first or pass sessionId",
          lookupKey,
        },
        recommendation: "Session not found — call action:open with expectedCalls, avgPricePerCallUsdc, chain, and agentId",
        facilitator: { url: facilitatorUrl, mppDocs },
        nextSteps: [
          `POST action:open with agentId ${input.agentId ?? "(required)"} and chain ${chain}`,
          "Then action:voucher before each downstream call",
          "Then action:close with the same agentId+chain or sessionId",
        ],
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
        resolvedBy,
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
      session.closedAt = new Date().toISOString();
      await saveSessions(rows);
      return wrapMpp({
        action: "close",
        session,
        settlement: buildSettlement(session, "closed"),
        resolvedBy,
        recommendation: "Settle aggregate USDC once on-chain via facilitator",
        facilitator: { url: facilitatorUrl, mppDocs },
        nextSteps: ["Facilitator settles session total to payTo wallet"],
        savingsNote: `Session used ${session.callsUsed} of ${session.expectedCalls} planned calls; saved ~$${session.estimatedSavingsUsdc.toFixed(2)} vs per-call`,
        success: true,
      });
    }

    return wrapMpp({
      action: "status",
      session,
      resolvedBy,
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
