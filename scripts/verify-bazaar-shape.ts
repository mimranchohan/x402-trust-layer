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
  const outputSchema = outputInner?.example as Record<string, unknown> | undefined;
  return { inputSchema: !!inputSchema, outputSchema: !!outputSchema };
}

const path = "/api/x402/proxy";
const ext = buildBazaarExtension(path, "POST", { agentId: "test" });
const ok = extractLikeDiscovery(ext.schema);
console.log(path, ok);
if (!ok.inputSchema || !ok.outputSchema) process.exit(1);
console.log("Bazaar schema shape OK for AgentCash discovery");
