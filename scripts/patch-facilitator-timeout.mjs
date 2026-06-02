/**
 * Dexter facilitator /settle can exceed the default 10s HTTP timeout in @dexterai/x402.
 * Raise the default via env X402_FACILITATOR_TIMEOUT_MS (default 90000).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(root, "..", "node_modules", "@dexterai", "x402", "dist", "server");
const targets = ["index.js", "index.cjs"].map((f) => path.join(pkgRoot, f));

const oldSnippet = "this.timeoutMs=n?.timeoutMs??1e4";
const newSnippet =
  'this.timeoutMs=n?.timeoutMs??(Number(process.env.X402_FACILITATOR_TIMEOUT_MS)||9e4)';

let patched = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes(oldSnippet)) {
    if (src.includes("X402_FACILITATOR_TIMEOUT_MS")) {
      patched += 1;
      continue;
    }
    console.warn(`[patch-facilitator-timeout] pattern not found in ${path.basename(file)}`);
    continue;
  }
  src = src.replaceAll(oldSnippet, newSnippet);
  fs.writeFileSync(file, src);
  patched += 1;
}

if (patched === 0) {
  console.warn("[patch-facilitator-timeout] no files patched — check @dexterai/x402 version");
  process.exit(0);
}
console.log(`[patch-facilitator-timeout] patched ${patched} file(s), default timeout 90s`);
