import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agents = JSON.parse(readFileSync(join(root, "public/data/agents.json"), "utf8")).agents;
const outDir = join(root, "public/social/cards");
mkdirSync(outDir, { recursive: true });

const tierColors = {
  entry: "#16C7C0",
  marketplace: "#3B82F6",
  orchestration: "#8B5CF6",
  core: "#34D399",
  attestation: "#F5A623",
  trust: "#F97316",
  intelligence: "#A78BFA",
  enterprise: "#E879F9",
  tier1: "#FBBF24",
};

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(text, max = 52) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

for (const a of agents) {
  const color = tierColors[a.tier] || "#16C7C0";
  const price = `$${a.price.toFixed(2)}`;
  const summaryLines = wrap(a.summary, 48);
  const yStart = 280;
  const summarySvg = summaryLines
    .map((ln, i) => `<text x="80" y="${yStart + i * 36}" fill="#8b949e" font-family="system-ui,sans-serif" font-size="26">${esc(ln)}</text>`)
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#16C7C0" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#16C7C0" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="#050608"/>
  <rect width="1200" height="675" fill="url(#g)"/>
  <line x1="80" y1="120" x2="1120" y2="120" stroke="#1a2332" stroke-width="2"/>
  <text x="80" y="72" fill="#16C7C0" font-family="ui-monospace,monospace" font-size="22" font-weight="600">x402 TRUST LAYER</text>
  <text x="1120" y="72" fill="#e6edf3" font-family="ui-monospace,monospace" font-size="28" font-weight="700" text-anchor="end">${esc(price)}</text>
  <rect x="80" y="145" width="auto" height="0" fill="none"/>
  <text x="80" y="200" fill="#e6edf3" font-family="system-ui,sans-serif" font-size="44" font-weight="700">${esc(a.name)}</text>
  <rect x="80" y="218" width="${Math.min(a.tierLabel.length * 11 + 24, 400)}" height="32" rx="6" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1"/>
  <text x="92" y="240" fill="${color}" font-family="ui-monospace,monospace" font-size="16" font-weight="600">${esc(a.tierLabel.toUpperCase())}</text>
  <text x="80" y="268" fill="#16C7C0" font-family="ui-monospace,monospace" font-size="22">${esc(a.method)} ${esc(a.path)}</text>
  ${summarySvg}
  <line x1="80" y1="580" x2="1120" y2="580" stroke="#1a2332" stroke-width="2"/>
  <text x="80" y="630" fill="#484f58" font-family="ui-monospace,monospace" font-size="20">x402trustlayer.xyz</text>
  <text x="1120" y="630" fill="#484f58" font-family="ui-monospace,monospace" font-size="20" text-anchor="end">100% verified · Base + Solana</text>
</svg>`;

  writeFileSync(join(outDir, `${a.id}.svg`), svg);
}

console.log(`Generated ${agents.length} cards in public/social/cards/`);
