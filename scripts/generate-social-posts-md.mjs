import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agents = JSON.parse(readFileSync(join(root, "public/data/agents.json"), "utf8")).agents;
const out = join(root, "docs/social");
mkdirSync(out, { recursive: true });

const posts = agents.map((a, i) => {
  const price = `$${a.price.toFixed(2)}`;
  const img = `/social/cards/${a.id}.svg`;
  const url = `https://x402trustlayer.xyz${a.path}`;
  return `## ${i + 1}. ${a.name}

**Image:** \`public${img}\`  
**Tier:** ${a.tierLabel} · **Price:** ${price}/call

\`\`\`
${a.name} — ${price}/call

${a.summary}

${a.method} ${a.path}
Layer: ${a.layer}

Why: ${a.why}

No API keys. Pay with USDC on Base or Solana.

${url}

#x402 #AIagents #AgentPayments #Web3 #x402TrustLayer
\`\`\`
`;
});

writeFileSync(
  join(out, "POSTS-ENDPOINTS.md"),
  `# X Posts — All 31 Endpoints

Each post includes a branded card image in \`public/social/cards/\`.

Copy the text block, attach the matching \`.svg\` (export as PNG from browser if needed).

---

${posts.join("\n---\n\n")}`,
);

console.log("Wrote docs/social/POSTS-ENDPOINTS.md");
