import type { Request, Response } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listCertifiedHosts } from "../lib/certified-sellers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const escrowPath = path.join(__dirname, "..", "..", "data", "metered-escrows.json");
const mppPath = path.join(__dirname, "..", "..", "data", "mpp-sessions.json");

async function loadEscrows() {
  try {
    const raw = await readFile(escrowPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function loadMppSessions() {
  try {
    const raw = await readFile(mppPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function handleDashboardSummary(req: Request, res: Response): Promise<void> {
  const certified = await listCertifiedHosts();
  const escrows = await loadEscrows();
  const mpp = await loadMppSessions();

  // Compute stats
  const totalEscrowBudget = escrows.reduce((sum: number, s: any) => sum + (s.budgetUsdc || 0), 0);
  const totalEscrowSpent = escrows.reduce((sum: number, s: any) => sum + (s.spentUsdc || 0), 0);
  const activeEscrowsCount = escrows.filter((s: any) => s.status === "active").length;
  
  const mppCallsUsed = mpp.reduce((sum: number, s: any) => sum + (s.callsUsed || 0), 0);
  const totalMppSpent = mpp.reduce((sum: number, s: any) => sum + ((s.callsUsed || 0) * (s.avgPricePerCallUsdc || 0)), 0);

  const totalVolume = Number((totalEscrowSpent + totalMppSpent).toFixed(4));
  const verificationRevenue = Number((escrows.length * 0.05 + mpp.length * 0.03 + certified.length * 0.10).toFixed(2));

  const stats = {
    totalVolumeUsdc: totalVolume,
    verificationRevenueUsdc: verificationRevenue,
    certifiedHostsCount: certified.length,
    activeEscrows: activeEscrowsCount,
    totalEscrowsCount: escrows.length,
    totalMppSessions: mpp.length,
    mppTotalCalls: mppCallsUsed,
    telemetryTimestamp: new Date().toISOString(),
  };

  const wantsHtml = req.query.html === "true" || req.headers.accept?.includes("text/html");

  if (wantsHtml) {
    const certifiedRows = certified.map((c: any) => `
      <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
        <td class="py-3 px-4 font-mono text-sm text-sky-400">${c.host}</td>
        <td class="py-3 px-4 text-center font-bold text-sm"><span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">${c.grade}</span></td>
        <td class="py-3 px-4 text-center font-mono text-sm text-purple-400">${c.badgeId}</td>
        <td class="py-3 px-4 text-right font-mono text-sm text-slate-300">$${c.bondUsdc || 0}</td>
      </tr>
    `).join("");

    const escrowRows = escrows.map((e: any) => `
      <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
        <td class="py-3 px-4 font-mono text-xs text-sky-400">${e.sessionId.slice(0, 15)}...</td>
        <td class="py-3 px-4 font-mono text-xs text-slate-300">${e.buyerWallet.slice(0, 8)}...${e.buyerWallet.slice(-6)}</td>
        <td class="py-3 px-4 text-right font-mono text-sm font-semibold text-emerald-400">$${e.spentUsdc.toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-mono text-sm text-slate-400">/ $${e.budgetUsdc.toFixed(2)}</td>
        <td class="py-3 px-4 text-center text-xs">
          <span class="px-2 py-0.5 rounded font-bold ${e.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}">
            ${e.status.toUpperCase()}
          </span>
        </td>
      </tr>
    `).join("");

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>x402 Trust Layer Control Plane</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #030712;
      --panel: rgba(17, 24, 39, 0.6);
      --border: rgba(255, 255, 255, 0.08);
      --primary: #8b5cf6;
      --primary-glow: rgba(139, 92, 246, 0.15);
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.15);
    }
    body {
      background-color: var(--bg);
      color: #f3f4f6;
      font-family: 'Outfit', sans-serif;
      margin: 0;
      padding: 0;
      min-height: 100vh;
      background-image: radial-gradient(circle at 10% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.05) 0%, transparent 40%);
    }
    header {
      background: rgba(3, 7, 18, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .nav-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, #a78bfa 0%, #34d399 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .pulse-badge {
      display: inline-block;
      width: 8px;
      height: 8px;
      background-color: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--success);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 3rem 2rem;
      box-sizing: border-box;
    }
    .grid-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3rem;
    }
    .stat-card {
      background: var(--panel);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .stat-card:hover {
      transform: translateY(-4px);
      border-color: rgba(255, 255, 255, 0.15);
    }
    .stat-card::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: var(--primary);
    }
    .stat-card.success::after {
      background: var(--success);
    }
    .stat-title {
      color: #9ca3af;
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .stat-value {
      font-size: 2.25rem;
      font-weight: 700;
      font-family: 'Space Grotesk', sans-serif;
      margin: 0;
    }
    .grid-tables {
      display: grid;
      grid-template-columns: 1fr;
      gap: 2rem;
    }
    @media (min-width: 1024px) {
      .grid-tables {
        grid-template-columns: 1fr 1fr;
      }
    }
    .table-container {
      background: var(--panel);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      overflow: hidden;
    }
    .table-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      text-align: left;
      padding: 0.75rem 1rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #9ca3af;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    td {
      padding: 1rem;
    }
    .footer {
      text-align: center;
      padding: 3rem 1rem;
      color: #4b5563;
      font-size: 0.875rem;
      border-top: 1px solid var(--border);
      margin-top: 5rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="nav-container">
      <div class="logo">
        <span class="pulse-badge"></span>
        x402 Trust Layer Control Plane
      </div>
      <div style="font-size: 0.875rem; color: #9ca3af; font-family: monospace;">v5.0.0</div>
    </div>
  </header>

  <main>
    <div class="grid-stats">
      <div class="stat-card">
        <div class="stat-title">Total Volume Transacted</div>
        <div class="stat-value text-indigo-400">$${stats.totalVolumeUsdc.toFixed(4)} USDC</div>
      </div>
      <div class="stat-card success">
        <div class="stat-title">Verification Revenue</div>
        <div class="stat-value text-emerald-400">$${stats.verificationRevenueUsdc.toFixed(2)} USDC</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Certified API Hosts</div>
        <div class="stat-value text-sky-400">${stats.certifiedHostsCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Active Escrow Sessions</div>
        <div class="stat-value text-amber-400">${stats.activeEscrows}</div>
      </div>
    </div>

    <div class="grid-tables">
      <div class="table-container">
        <div class="table-title">
          Certified AI Market Sellers
          <span style="font-size: 0.75rem; font-weight: normal; color: #9ca3af; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.05)">Live Node Certs</span>
        </div>
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th style="width: 40%">Host Origin</th>
                <th style="width: 20%; text-align: center;">Security Grade</th>
                <th style="width: 25%; text-align: center;">Badge ID</th>
                <th style="width: 15%; text-align: right;">Locked Bond</th>
              </tr>
            </thead>
            <tbody>
              ${certifiedRows.length ? certifiedRows : `<tr><td colspan="4" class="text-center py-6 text-slate-500">No certified hosts registered yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="table-container">
        <div class="table-title">
          Active Metered Escrow sessions (Faremeter)
          <span style="font-size: 0.75rem; font-weight: normal; color: #9ca3af; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.05)">Usage Billing</span>
        </div>
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th style="width: 30%">Session ID</th>
                <th style="width: 25%">Buyer Wallet</th>
                <th style="width: 20%; text-align: right;">Spent</th>
                <th style="width: 15%; text-align: right;">Budget</th>
                <th style="width: 10%; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${escrowRows.length ? escrowRows : `<tr><td colspan="5" class="text-center py-6 text-slate-500">No active metered escrows.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <div class="footer">
    Telemetry generated at ${new Date(stats.telemetryTimestamp).toLocaleString()} | x402 Open Source Standard Platform
  </div>
</body>
</html>
    `);
  } else {
    res.json({
      ok: true,
      stats,
      certified,
      meteredSessions: escrows,
      mppSessions: mpp,
    });
  }
}
