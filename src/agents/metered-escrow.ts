import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentTrustMeta, withAgentTrust, type WithAgentTrust } from "../lib/agent-response.js";

export type MeteredSession = {
  sessionId: string;
  buyerWallet: string;
  sellerHost: string;
  budgetUsdc: number;
  spentUsdc: number;
  status: "active" | "closed";
  openedAt: string;
  closedAt?: string;
};

export type MeteredResult = {
  status: "ok" | "error";
  ok: boolean;
  success: boolean;
  message: string;
  session: MeteredSession | null;
  refundUsdc?: number;
  settledUsdc?: number;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const escrowPath = path.join(__dirname, "..", "..", "data", "metered-escrows.json");

async function loadEscrows(): Promise<MeteredSession[]> {
  try {
    const raw = await readFile(escrowPath, "utf8");
    return JSON.parse(raw) as MeteredSession[];
  } catch {
    return [];
  }
}

async function saveEscrows(sessions: MeteredSession[]): Promise<void> {
  await mkdir(path.dirname(escrowPath), { recursive: true });
  await writeFile(escrowPath, JSON.stringify(sessions, null, 2), "utf8");
}

export async function openMeteredSession(
  buyerWallet: string,
  sellerHost: string,
  budgetUsdc: number
): Promise<WithAgentTrust<MeteredResult>> {
  const sessions = await loadEscrows();
  
  const newSession: MeteredSession = {
    sessionId: `escrow_${randomBytes(8).toString("hex")}`,
    buyerWallet: buyerWallet.trim().toLowerCase(),
    sellerHost: sellerHost.trim().toLowerCase(),
    budgetUsdc: Number(budgetUsdc),
    spentUsdc: 0,
    status: "active",
    openedAt: new Date().toISOString(),
  };

  sessions.push(newSession);
  await saveEscrows(sessions);

  return withAgentTrust(
    {
      status: "ok" as const,
      ok: true,
      success: true,
      message: `Metered escrow session opened with budget of ${budgetUsdc} USDC`,
      session: newSession,
    },
    agentTrustMeta(["metered_escrow_open"], {
      confidence: 0.95,
      sources: ["metered-escrow"],
    })
  );
}

export async function chargeMeteredSession(
  sessionId: string,
  amountUsdc: number
): Promise<WithAgentTrust<MeteredResult>> {
  const sessions = await loadEscrows();
  const session = sessions.find((s) => s.sessionId === sessionId);

  if (!session) {
    return withAgentTrust(
      {
        status: "error" as const,
        ok: false,
        success: false,
        message: `Metered escrow session not found: ${sessionId}`,
        session: null,
      },
      agentTrustMeta(["metered_escrow_error", "session_not_found"], {
        confidence: 0.5,
        sources: ["metered-escrow"],
      })
    );
  }

  if (session.status === "closed") {
    return withAgentTrust(
      {
        status: "error" as const,
        ok: false,
        success: false,
        message: `Cannot charge. Escrow session is already closed: ${sessionId}`,
        session,
      },
      agentTrustMeta(["metered_escrow_error", "session_already_closed"], {
        confidence: 0.6,
        sources: ["metered-escrow"],
      })
    );
  }

  const newSpent = Number((session.spentUsdc + Number(amountUsdc)).toFixed(4));
  if (newSpent > session.budgetUsdc) {
    return withAgentTrust(
      {
        status: "error" as const,
        ok: false,
        success: false,
        message: `Insufficient escrow budget. Required: ${newSpent} USDC, Locked: ${session.budgetUsdc} USDC`,
        session,
      },
      agentTrustMeta(["metered_escrow_insufficient_funds"], {
        confidence: 0.85,
        sources: ["metered-escrow"],
      })
    );
  }

  session.spentUsdc = newSpent;
  await saveEscrows(sessions);

  return withAgentTrust(
    {
      status: "ok" as const,
      ok: true,
      success: true,
      message: `Successfully charged ${amountUsdc} USDC to session ${sessionId}. Remaining: ${(session.budgetUsdc - session.spentUsdc).toFixed(4)} USDC`,
      session,
    },
    agentTrustMeta(["metered_escrow_charge"], {
      confidence: 0.95,
      sources: ["metered-escrow"],
    })
  );
}

export async function closeMeteredSession(
  sessionId: string
): Promise<WithAgentTrust<MeteredResult>> {
  const sessions = await loadEscrows();
  const session = sessions.find((s) => s.sessionId === sessionId);

  if (!session) {
    return withAgentTrust(
      {
        status: "error" as const,
        ok: false,
        success: false,
        message: `Metered escrow session not found: ${sessionId}`,
        session: null,
      },
      agentTrustMeta(["metered_escrow_error", "session_not_found"], {
        confidence: 0.5,
        sources: ["metered-escrow"],
      })
    );
  }

  if (session.status === "closed") {
    return withAgentTrust(
      {
        status: "ok" as const,
        ok: true,
        success: true,
        message: `Escrow session is already closed.`,
        session,
        refundUsdc: Number((session.budgetUsdc - session.spentUsdc).toFixed(4)),
        settledUsdc: session.spentUsdc,
      },
      agentTrustMeta(["metered_escrow_idempotent_close"], {
        confidence: 0.9,
        sources: ["metered-escrow"],
      })
    );
  }

  session.status = "closed";
  session.closedAt = new Date().toISOString();
  await saveEscrows(sessions);

  const refundUsdc = Number((session.budgetUsdc - session.spentUsdc).toFixed(4));

  return withAgentTrust(
    {
      status: "ok" as const,
      ok: true,
      success: true,
      message: `Escrow session successfully closed. Settled: ${session.spentUsdc} USDC. Refunded: ${refundUsdc} USDC`,
      session,
      refundUsdc,
      settledUsdc: session.spentUsdc,
    },
    agentTrustMeta(["metered_escrow_close"], {
      confidence: 0.95,
      sources: ["metered-escrow"],
    })
  );
}
