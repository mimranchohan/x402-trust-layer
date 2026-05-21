/**
 * Regenerate openapi.json from AgentCash discovery spec. Run: npm run openapi:generate
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.PUBLIC_BASE_URL ??=
  "https://x402-agent-suite-production.up.railway.app";
process.env.PAY_TO_ADDRESS ??= "9c7tE587KpGYBjiNQrjw3nGvxQHhSYKU4Ba6WRgQsHkt";
process.env.PAY_TO_EVM ??= "0xD56013Abd05E588f2d025193FCe90416816BDBBC";

const { buildAgentCashOpenApi } = await import("../src/lib/openapi-agentcash.js");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = buildAgentCashOpenApi();
const paths = spec.paths as Record<string, unknown>;
writeFileSync(path.join(root, "openapi.json"), JSON.stringify(spec, null, 2));
console.log(`Wrote openapi.json with ${Object.keys(paths).length} paths (AgentCash discovery)`);
