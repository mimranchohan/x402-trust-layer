/**
 * Patch @dexterai/x402 server facilitator client:
 * - raise HTTP timeout / cap retries (avoids 55s+ hangs → Railway 504)
 * - surface facilitator /settle 500 body in errorReason (e.g. tx confirmation timeout)
 * - pass full facilitator /supported extra into cached accepts (permit2 on Base)
 *
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

const settleCatchFrom = `    } catch (error) {
      const reason = error instanceof HttpError ? \`facilitator_error_\${error.status}\` : error instanceof Error && error.name === "AbortError" ? "facilitator_timeout" : error instanceof Error ? error.message : "unexpected_settle_error";
      return {
        success: false,
        network: requirements.network,
        errorReason: reason
      };
    }`;

const settleCatchTo = `    } catch (error) {
      let reason = error instanceof HttpError ? \`facilitator_error_\${error.status}\` : error instanceof Error && error.name === "AbortError" ? "facilitator_timeout" : error instanceof Error ? error.message : "unexpected_settle_error";
      if (error instanceof HttpError && error.body) {
        try {
          const parsed = JSON.parse(error.body);
          if (typeof parsed.error === "string") {
            const snippet = parsed.error.split("\\n")[0].slice(0, 120).replace(/\\s+/g, " ");
            reason = \`facilitator_error_\${error.status}:\${snippet}\`;
          }
        } catch {}
      }
      return {
        success: false,
        network: requirements.network,
        errorReason: reason
      };
    }`;

const networkExtraFrom = `    return {
      ...cachedExtra?.feePayer ? { feePayer: cachedExtra.feePayer } : {},
      decimals: cachedExtra?.decimals ?? asset.decimals,
      name: cachedExtra?.name,
      version: cachedExtra?.version
    };`;

const networkExtraTo = `    return {
      ...(cachedExtra ?? {}),
      decimals: cachedExtra?.decimals ?? asset.decimals
    };`;

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
  { from: settleCatchFrom, to: settleCatchTo },
  { from: networkExtraFrom, to: networkExtraTo },
];

let patched = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  const alreadyPatched =
    src.includes("X402_FACILITATOR_TIMEOUT_MS") &&
    src.includes("error.body") &&
    src.includes("...(cachedExtra ?? {})");
  if (alreadyPatched) {
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
console.log(
  `[patch-facilitator-timeout] patched ${patched} file(s) — timeout 90s, settle body surfaced, permit2 extra`,
);
