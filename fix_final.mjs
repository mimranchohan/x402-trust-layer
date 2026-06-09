import { readFileSync, writeFileSync } from "fs";
const f = "src/agents/pipeline-execute.ts";
let c = readFileSync(f, "utf8");

// Fix double PIPELINE_TIMEOUT_MS
while (c.includes("PIPELINE_TIMEOUT_MS") && c.indexOf("PIPELINE_TIMEOUT_MS") !== c.lastIndexOf("PIPELINE_TIMEOUT_MS")) {
  c = c.replace(
    "const PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS ?? \"8000\");\n\n/** Single paid call: guard + optional plan, failover, router, receipt audit hints. */\nconst PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS ?? \"8000\");",
    "const PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS ?? \"8000\");"
  );
}

// Fix bad catch (untyped, has refund_eligible)
const BAD = `.catch((err) => {
    if (err && err.code === "PIPELINE_TIMEOUT") return { status: "ok", allowed: false, summary: "Pipeline timeout", nextActions: ["retry"], guard: { allowed: false, summary: "timeout", checks_passed: [], confidence: 0 }, recommendedNextCalls: ["POST /api/guard/pre-x402"], bundleSavingsVsSeparateUsdc: 0, refund_eligible: true };
    throw err;
  });`;
const GOOD = `.catch((err: unknown) => {
    if (err != null && typeof err === "object" && (err as {code?:string}).code === "PIPELINE_TIMEOUT") {
      const t: PipelineExecuteResult = { status: "ok", allowed: false, summary: "Pipeline timeout", nextActions: ["retry"], guard: { allowed: false, summary: "timeout", checks_passed: [], confidence: 0 } as never, recommendedNextCalls: ["POST /api/guard/pre-x402"], bundleSavingsVsSeparateUsdc: 0 };
      return t;
    }
    throw err;
  });`;
if (c.includes(BAD)) { c = c.replace(BAD, GOOD); console.log("catch fixed"); }
else console.log("catch not found");

// Fix _pipelineInner empty line
c = c.replace("): Promise<PipelineExecuteResult> {\n  \n  const guard", "): Promise<PipelineExecuteResult> {\n  const guard");

writeFileSync(f, c, "utf8");
console.log("DONE");
console.log("TIMEOUT_MS count:", (c.match(/PIPELINE_TIMEOUT_MS/g)||[]).length);
console.log("guard count:", (c.match(/const guard = await runPreX402Guard/g)||[]).length);
