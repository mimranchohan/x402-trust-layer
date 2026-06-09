/**
 * Admin Dashboard  GET /admin
 *
 * Read-only HTML page showing:
 *   - Top agents by trust score (from agent_reputation_history)
 *   - Recent guard blocks (from telemetry_counters)
 *   - Spend stats (per-agent daily ledger via SQLite)
 *   - System counters (http_requests, settlements, replays)
 *
 * Protected by ADMIN_SECRET env var in production (X-Admin-Secret header or
 * ?secret= query param).  In development it is open.
 */

import type { Express, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { db } from "../lib/db.js";
import { metricsPayload } from "../lib/telemetry.js";
import { listTrustWebhooks } from "../lib/trust-events.js";
import { getRecentFailures, checkCircuitBreaker } from "../lib/settlement-failures.js";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
}

function requireAdmin(req: Request, res: Response): boolean {
  if (!isProduction()) return true;
  const secret = (process.env.ADMIN_SECRET ?? "").trim();
  if (!secret) {
    // No secret configured — block access in production for safety
    res.status(503).send("<h1>503 — Set ADMIN_SECRET env var to enable the admin dashboard</h1>");
    return false;
  }
  const headerRaw = req.headers["x-admin-secret"];
  const fromHeader = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  const fromQuery = typeof req.query.secret === "string" ? req.query.secret : "";
  const provided = (fromHeader ?? fromQuery ?? "").trim();
  if (
    !provided ||
    provided.length !== secret.length ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
  ) {
    res.status(403).send("<h1>403 Forbidden</h1><p>Provide X-Admin-Secret header or ?secret= query param</p>");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

type AgentRow = { wallet: string; agent_id: string | null; trust_score: number; tier: string; recorded_at: number };
type SpendRow = { agent_id: string; total_spent: number };
type BlockRow = { name: string; value: number };

function topAgents(limit = 20): AgentRow[] {
  try {
    return db.prepare(`
      SELECT wallet, agent_id, trust_score, tier, MAX(recorded_at) AS recorded_at
      FROM agent_reputation_history
      GROUP BY wallet
      ORDER BY trust_score DESC
      LIMIT ?
    `).all(limit) as AgentRow[];
  } catch {
    return [];
  }
}

function recentBlocked(limit = 10): { name: string; value: number }[] {
  try {
    return db.prepare(`
      SELECT name, value FROM telemetry_counters
      WHERE name IN ('replay_blocked','x402_settlement_failures','idempotency_replay')
      ORDER BY value DESC
      LIMIT ?
    `).all(limit) as BlockRow[];
  } catch {
    return [];
  }
}

function spendStats(): SpendRow[] {
  try {
    // ledger table stores per-agent day keys — shape: { key TEXT, value REAL }
    // stored in protocol_kv with store='ledger'
    return db.prepare(`
      SELECT key AS agent_id, value AS total_spent
      FROM protocol_kv
      WHERE store = 'ledger'
      ORDER BY CAST(value AS REAL) DESC
      LIMIT 20
    `).all() as SpendRow[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// HTML renderer
// ---------------------------------------------------------------------------

function tierBadge(tier: string): string {
  const colours: Record<string, string> = {
    PLATINUM: "background:#e5e4e2;color:#333;",
    GOLD:     "background:#fbbf24;color:#333;",
    SILVER:   "background:#94a3b8;color:#fff;",
    BRONZE:   "background:#b45309;color:#fff;",
    UNVERIFIED:"background:#6b7280;color:#fff;",
    UNKNOWN:  "background:#374151;color:#9ca3af;",
  };
  const s = colours[tier] ?? colours.UNKNOWN;
  return `<span style="padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;${s}">${tier}</span>`;
}

function html(agents: AgentRow[], blocks: { name: string; value: number }[], spend: SpendRow[], metrics: Record<string, unknown>): string {
  const counters = (metrics.counters ?? {}) as Record<string, number>;
  const uptime = metrics.uptimeSec as number;
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  const trustWebhookCount = (() => {
    try { return listTrustWebhooks().length; } catch { return 0; }
  })();

  const agentRows = agents.map((a) => `
    <tr>
      <td style="font-family:monospace;font-size:12px;color:#60a5fa;">${a.wallet}</td>
      <td style="text-align:center;">${tierBadge(a.tier)}</td>
      <td style="text-align:right;font-weight:700;color:#34d399;">${a.trust_score}</td>
      <td style="font-family:monospace;font-size:11px;color:#9ca3af;">${a.agent_id ?? "—"}</td>
      <td style="font-size:11px;color:#6b7280;">${new Date(a.recorded_at * 1000).toLocaleString()}</td>
    </tr>`).join("");

  const blockRows = blocks.map((b) => `
    <tr>
      <td style="font-family:monospace;color:#f87171;">${b.name}</td>
      <td style="text-align:right;font-weight:700;color:#fbbf24;">${b.value.toLocaleString()}</td>
    </tr>`).join("");

  const spendRows = spend.map((s) => `
    <tr>
      <td style="font-family:monospace;font-size:12px;color:#a78bfa;">${s.agent_id}</td>
      <td style="text-align:right;font-weight:700;color:#34d399;">$${Number(s.total_spent).toFixed(4)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>x402 Trust Layer — Admin</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;padding:24px}
    h1{font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:4px}
    .sub{color:#64748b;font-size:13px;margin-bottom:32px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:32px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px}
    .card-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:6px}
    .card-value{font-size:28px;font-weight:800;color:#f8fafc}
    .card-sub{font-size:11px;color:#475569;margin-top:4px}
    section{margin-bottom:36px}
    h2{font-size:15px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;background:#1e293b;border:1px solid #1e293b;border-radius:8px;overflow:hidden}
    th{background:#0f172a;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:8px 12px;text-align:left;border-bottom:1px solid #1e293b}
    td{padding:9px 12px;border-bottom:1px solid #0f172a;font-size:13px;color:#cbd5e1}
    tr:last-child td{border-bottom:none}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#0f172a;color:#64748b}
    .refresh{font-size:11px;color:#334155;margin-top:32px;text-align:right}
  </style>
</head>
<body>
  <h1>x402 Trust Layer — Admin Dashboard</h1>
  <p class="sub">Read-only · Refreshed at ${new Date().toUTCString()} · Uptime ${uptimeStr}</p>

  <div class="grid">
    <div class="card">
      <div class="card-label">HTTP Requests</div>
      <div class="card-value">${(counters.http_requests ?? 0).toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">Settlements</div>
      <div class="card-value">${(counters.x402_settlements ?? 0).toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">Replay Blocked</div>
      <div class="card-value" style="color:#f87171">${(counters.replay_blocked ?? 0).toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">Trust Webhooks</div>
      <div class="card-value">${trustWebhookCount}</div>
      <div class="card-sub">active subscriptions</div>
    </div>
    <div class="card">
      <div class="card-label">Nonce Backend</div>
      <div class="card-value" style="font-size:18px">${metrics.nonceBackend ?? "—"}</div>
    </div>
  </div>

  <section>
    <h2>Top Agents by Trust Score</h2>
    ${agents.length === 0
      ? `<p style="color:#475569;font-size:13px;padding:12px 0">No reputation history recorded yet.</p>`
      : `<table>
          <thead><tr>
            <th>Wallet</th><th>Tier</th><th style="text-align:right">Score</th>
            <th>Agent ID</th><th>Last Seen</th>
          </tr></thead>
          <tbody>${agentRows}</tbody>
        </table>`}
  </section>

  <section>
    <h2>Block &amp; Failure Counters</h2>
    ${blocks.length === 0
      ? `<p style="color:#475569;font-size:13px;padding:12px 0">No block events recorded.</p>`
      : `<table>
          <thead><tr><th>Counter</th><th style="text-align:right">Count</th></tr></thead>
          <tbody>${blockRows}</tbody>
        </table>`}
  </section>

  <section>
    <h2>Spend Stats (Top Agents)</h2>
    ${spend.length === 0
      ? `<p style="color:#475569;font-size:13px;padding:12px 0">No spend data recorded.</p>`
      : `<table>
          <thead><tr><th>Agent / Key</th><th style="text-align:right">Total USDC</th></tr></thead>
          <tbody>${spendRows}</tbody>
        </table>`}
  </section>

  <p class="refresh">Auto-refresh: <a href="javascript:location.reload()" style="color:#3b82f6">Reload</a></p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAdminDashboard(app: Express): void {
  app.get("/admin", async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const agents = topAgents(20);
    const blocks = recentBlocked(10);
    const spend = spendStats();
    const metrics = metricsPayload();

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html(agents, blocks, spend, metrics));
  });

  // Settlement failures — recent list + circuit breaker status
  app.get("/api/admin/settlement-failures", (req: Request, res: Response): void => {
    if (!requireAdmin(req, res)) return;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const failures = getRecentFailures(limit);
    const circuit = checkCircuitBreaker();
    res.json({
      ok: true,
      circuit,
      count: failures.length,
      failures: failures.map((f) => ({
        id: f.id,
        reason: f.reason,
        walletAddress: f.wallet_address,
        amountUsdc: f.amount_usdc,
        network: f.network,
        endpoint: f.endpoint,
        createdAt: new Date(f.created_at * 1000).toISOString(),
      })),
    });
  });

  // JSON version for programmatic access
  app.get("/admin/json", (req: Request, res: Response): void => {
    if (!requireAdmin(req, res)) return;
    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      metrics: metricsPayload(),
      topAgents: topAgents(20),
      blockCounters: recentBlocked(10),
      spendStats: spendStats(),
      trustWebhooks: (() => { try { return listTrustWebhooks().length; } catch { return 0; } })(),
    });
  });
}
