/**
 * x402gle agent.md Step 3 — run opendexter audition and save JSON.
 * Usage: npx tsx scripts/run-x402gle-audition.ts [origin]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isTransientAuditionError,
  parseAuditionJson,
  runOpendexterAuditionWithRetry,
} from "./lib/opendexter-audition.js";

const origin =
  process.argv[2]?.trim() || "https://x402trustlayer.xyz";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "x402gle-audition-result.json");

console.log(`Auditioning ${origin} ...\n`);

try {
  const { raw, exitCode, attempts } = await runOpendexterAuditionWithRetry(origin, { cwd: root });
  writeFileSync(outPath, raw, "utf8");
  console.log(raw);
  console.log(`\nWrote ${outPath} (exit ${exitCode}, attempts ${attempts})`);

  const data = parseAuditionJson(raw) as { error?: string; message?: string; cooldown_active?: boolean; routes?: unknown[] };
  if (isTransientAuditionError(data)) {
    console.error(
      "\nTransient x402gle/Dexter ingest error (HTML instead of JSON). Wait 1–2 minutes and run:\n  npm run audition:x402gle",
    );
    process.exit(3);
  }
  if (data.error === "cooldown_active") {
    console.log("\nCooldown active — use x402gle UI Test now per route until retry window opens.");
    process.exit(2);
  }
  if (Array.isArray(data.routes)) {
    const failed = data.routes.filter(
      (r: { status?: string }) => r.status && r.status !== "pass",
    );
    console.log(`Routes: ${data.routes.length}, need fix: ${failed.length}`);
    process.exit(failed.length > 0 ? 1 : 0);
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}
