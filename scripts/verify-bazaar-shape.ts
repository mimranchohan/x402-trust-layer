/**
 * Local check matching @agentcash/discovery extractSchemas2 expectations.
 * Run: npx tsx scripts/verify-bazaar-shape.ts
 */
import { buildBazaarExtension } from "../src/lib/bazaar-extension.js";

function extractLikeDiscovery(schema: Record<string, unknown>) {
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props) return {};
  const inputProps = props.input as Record<string, unknown> | undefined;
  const inputInner = inputProps?.properties as Record<string, unknown> | undefined;
  const inputSchema =
    (inputInner?.body as Record<string, unknown> | undefined) ??
    (inputInner?.queryParams as Record<string, unknown> | undefined);
  const outputProps = props.output as Record<string, unknown> | undefined;
  const outputInner = outputProps?.properties as Record<string, unknown> | undefined;
  const outputSchema =
    (outputInner?.example as Record<string, unknown> | undefined) ??
    (outputProps?.example as Record<string, unknown> | undefined);
  return { inputSchema: !!inputSchema, outputSchema: !!outputSchema };
}

const path = "/api/x402/proxy";
const ext = buildBazaarExtension(path, "POST", { agentId: "test" });
const getExt = buildBazaarExtension(path, "GET", {});
const ok = extractLikeDiscovery(ext.schema);
const getOk = extractLikeDiscovery(getExt.schema);
console.log(path, "POST", ok);
console.log(path, "GET probe", getOk);
if (!ok.inputSchema || !ok.outputSchema || !getOk.inputSchema || !getOk.outputSchema) process.exit(1);
if (!ext.schema.$schema) {
  console.error("Missing $schema on bazaar extension");
  process.exit(1);
}
console.log("Bazaar schema shape OK for AgentCash discovery");
