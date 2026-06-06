/**
 * Dexter facilitator /settle: raise HTTP timeout and cap retries (avoids 55s+ hangs → Railway 504).
 * Env: X402_FACILITATOR_TIMEOUT_MS (default 90000), X402_FACILITATOR_MAX_RETRIES (default 2).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(root, "..", "node_modules", "@dexterai", "x402", "dist", "server");
const targets = ["index.js", "index.cjs"].map((f) => path.join(pkgRoot, f));

const timeoutDefault =
  "(Number(process.env.X402_FACILITATOR_TIMEOUT_MS)||9e4)";
const maxRetriesDefault =
  "(Number(process.env.X402_FACILITATOR_MAX_RETRIES)||2)";

/** @type {{ from: string; to: string }[]} */
const replacements = [
  {
    from: "this.timeoutMs=n?.timeoutMs??1e4",
    to: `this.timeoutMs=n?.timeoutMs??${timeoutDefault}`,
  },
  {
    from: "this.timeoutMs = config?.timeoutMs ?? 1e4",
    to: `this.timeoutMs = config?.timeoutMs ?? ${timeoutDefault}`,
  },
  {
    from: "this.maxRetries = config?.maxRetries ?? 3",
    to: `this.maxRetries = config?.maxRetries ?? ${maxRetriesDefault}`,
  },
];

let patched = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  if (src.includes("X402_FACILITATOR_TIMEOUT_MS")) {
    patched += 1;
    continue;
  }
  let changed = false;
  for (const { from, to } of replacements) {
    if (src.includes(from)) {
      src = src.replaceAll(from, to);
      changed = true;
    }
  }
  if (!changed) {
    console.warn(`[patch-facilitator-timeout] pattern not found in ${path.basename(file)}`);
    continue;
  }
  fs.writeFileSync(file, src);
  patched += 1;
}

if (patched === 0) {
  console.warn("[patch-facilitator-timeout] no files patched — check @dexterai/x402 version");
  process.exit(0);
}
console.log(`[patch-facilitator-timeout] patched ${patched} file(s), timeout 90s default, maxRetries 2`);
