import { readFileSync, writeFileSync } from "fs";
const f = "src/agents/pipeline-execute.ts";
let c = readFileSync(f, "utf8");
if (c.includes("PIPELINE_TIMEOUT_MS")) { console.log("already fixed"); process.exit(0); }
const OLD = `): Promise<PipelineExecuteResult> {
  const guard = await runPreX402Guard(input);`;
const NEW = `): Promise<PipelineExecuteResult> {
  return Promise.race([
    _inner(input),
    new Promise<PipelineExecuteResult>((_, rej) =>
      setTimeout(() => rej(Object.assign(new Error("t"), { code: "PIPELINE_TIMEOUT" })), PIPELINE_TIMEOUT_MS)
    ),
  ]).catch((err: unknown) => {
    if (err != null && typeof err === "object" && (err as { code?: string }).code === "PIPELINE_TIMEOUT") {
      const t: PipelineExecuteResult = {
        status: "ok", allowed: false,
        summary: "Pipeline timeout — retry",
        nextActions: ["retry"],
        guard: { allowed: false, summary: "timeout", checks_passed: [], confidence: 0 } as never,
        recommendedNextCalls: ["POST /api/guard/pre-x402"],
        bundleSavingsVsSeparateUsdc: 0,
      };
      return t;
    }
    throw err;
  });
}

async function _inner(input: PipelineExecuteInput): Promise<PipelineExecuteResult> {
  const guard = await runPreX402Guard(input);`;
c = c.replace(
  "/** Single paid call: guard + optional plan, failover, router, receipt audit hints. */",
  "const PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS ?? \"8000\");\n\n/** Single paid call: guard + optional plan, failover, router, receipt audit hints. */"
).replace(OLD, NEW);
writeFileSync(f, c, "utf8");
console.log("DONE");
