/**
 * Run `opendexter audition` without Windows libuv crashes from rapid execSync/npx loops.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientAuditionError(data: Record<string, unknown>): boolean {
  if (data.error === "cooldown_active") return false;
  if (data.error === "audition_failed") return true;
  const msg = String(data.message ?? "");
  return msg.includes("<!DOCTYPE") || msg.includes("is not valid JSON");
}

/** Pull the last JSON object from CLI output (stderr warnings may prefix stdout). */
export function parseAuditionJson(raw: string): Record<string, unknown> {
  const lines = raw.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line?.startsWith("{")) continue;
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      /* continue */
    }
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  }
  throw new Error("No JSON object in opendexter output");
}

type SpawnSpec = { command: string; args: string[]; shell: boolean };

function auditionSpawnSpec(targetUrl: string): SpawnSpec {
  const cliArgs = ["-y", "@dexterai/opendexter@latest", "audition", targetUrl, "--json"];
  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "npx", ...cliArgs], shell: false };
  }
  return { command: "npx", args: cliArgs, shell: false };
}

export type AuditionRunOptions = {
  cwd?: string;
  timeoutMs?: number;
};

/** One audition subprocess; resolves with combined stdout+stderr text. */
export function runOpendexterAudition(
  targetUrl: string,
  options: AuditionRunOptions = {},
): Promise<{ raw: string; exitCode: number | null }> {
  const cwd = options.cwd ?? root;
  const timeoutMs = options.timeoutMs ?? 300_000;
  const { command, args, shell } = auditionSpawnSpec(targetUrl);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell,
      env: { ...process.env },
    });

    let out = "";
    const append = (chunk: Buffer | string) => {
      out += chunk.toString();
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`opendexter audition timed out after ${timeoutMs}ms for ${targetUrl}`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ raw: out, exitCode: code });
    });
  });
}

export type AuditionRetryOptions = AuditionRunOptions & {
  attempts?: number;
  retryDelayMs?: number;
};

/**
 * Retry when x402gle/Dexter ingest returns HTML (audition_failed) or the Windows
 * libuv crash follows a failed parse. Prefer this over bare `npx` on Windows.
 */
export async function runOpendexterAuditionWithRetry(
  targetUrl: string,
  options: AuditionRetryOptions = {},
): Promise<{ raw: string; exitCode: number | null; attempts: number }> {
  const attempts = options.attempts ?? Number(process.env.AUDITION_RETRY_ATTEMPTS ?? 3);
  const retryDelayMs = options.retryDelayMs ?? Number(process.env.AUDITION_RETRY_DELAY_MS ?? 25_000);
  let lastRaw = "";
  let lastCode: number | null = null;

  for (let i = 1; i <= attempts; i++) {
    const { raw, exitCode } = await runOpendexterAudition(targetUrl, options);
    lastRaw = raw;
    lastCode = exitCode;

    try {
      const data = parseAuditionJson(raw);
      if (!isTransientAuditionError(data)) {
        return { raw, exitCode, attempts: i };
      }
      if (i < attempts) {
        console.warn(
          `[audition] transient ingest error (attempt ${i}/${attempts}): ${data.message ?? data.error}. Retrying in ${retryDelayMs}ms...`,
        );
        await sleep(retryDelayMs);
      }
    } catch {
      if (i < attempts) {
        console.warn(`[audition] no JSON in output (attempt ${i}/${attempts}). Retrying in ${retryDelayMs}ms...`);
        await sleep(retryDelayMs);
      }
    }
  }

  return { raw: lastRaw, exitCode: lastCode, attempts };
}

export type BatchAuditionOptions = {
  delayMs?: number;
  cwd?: string;
  onRouteStart?: (routePath: string, index: number, total: number) => void;
};

/**
 * Run auditions sequentially with a pause between each (avoids UV_HANDLE_CLOSING on Windows).
 */
export async function runAuditionBatch(
  routes: Array<{ path: string; url: string }>,
  options: BatchAuditionOptions = {},
): Promise<
  Array<{
    path: string;
    ok: boolean;
    score?: number;
    status?: string;
    error?: string;
    exitCode?: number | null;
  }>
> {
  const delayMs = options.delayMs ?? Number(process.env.AUDITION_DELAY_MS ?? 8_000);
  const results: Array<{
    path: string;
    ok: boolean;
    score?: number;
    status?: string;
    error?: string;
    exitCode?: number | null;
  }> = [];

  for (let i = 0; i < routes.length; i++) {
    const { path: routePath, url } = routes[i]!;
    options.onRouteStart?.(routePath, i, routes.length);

    if (i > 0) {
      await sleep(delayMs);
    }

    try {
      const { raw, exitCode } = await runOpendexterAuditionWithRetry(url, { cwd: options.cwd });
      let data: Record<string, unknown>;
      try {
        data = parseAuditionJson(raw);
      } catch (parseErr) {
        results.push({
          path: routePath,
          ok: false,
          exitCode,
          error: `JSON parse failed (exit ${exitCode}): ${parseErr instanceof Error ? parseErr.message : parseErr}`,
        });
        continue;
      }

      if (isTransientAuditionError(data)) {
        results.push({
          path: routePath,
          ok: false,
          exitCode,
          error: `audition_failed: ${data.message ?? "x402gle ingest returned HTML — retry later"}`,
        });
        continue;
      }

      if (data.error === "cooldown_active") {
        results.push({ path: routePath, ok: false, error: "cooldown_active", exitCode });
        break;
      }

      const routesArr = data.routes as Array<{ score?: number; status?: string }> | undefined;
      const route = routesArr?.[0];
      results.push({
        path: routePath,
        ok: route?.status === "pass" && (route?.score ?? 0) >= 75,
        score: route?.score,
        status: route?.status,
        exitCode,
      });
    } catch (err) {
      results.push({
        path: routePath,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
