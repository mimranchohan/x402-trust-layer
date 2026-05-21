import type { Request } from "express";
import { VERIFY_EXAMPLES } from "./verify-examples.js";

type JsonSchema = Record<string, unknown>;

function exampleToJsonSchema(value: unknown): JsonSchema {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const items = value.length ? exampleToJsonSchema(value[0]) : { type: "object" };
    return { type: "array", items };
  }
  switch (typeof value) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      const obj = value as Record<string, unknown>;
      const properties: Record<string, JsonSchema> = {};
      for (const [k, v] of Object.entries(obj)) {
        properties[k] = exampleToJsonSchema(v);
      }
      return {
        type: "object",
        properties,
        required: Object.keys(obj),
      };
    }
    default:
      return { type: "string" };
  }
}

function registryQueryInputSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      minGrade: { type: "string", description: "Minimum security grade (A–F)" },
      agentId: { type: "string", description: "Filter by agent id" },
      limit: { type: "integer", description: "Max records to return" },
    },
  };
}

function buildInputJsonSchema(path: string, method: string, inputExample: unknown): JsonSchema {
  if (method.toUpperCase() === "GET" && path === "/api/attestation/registry") {
    return registryQueryInputSchema();
  }
  if (inputExample && typeof inputExample === "object") {
    return exampleToJsonSchema(inputExample);
  }
  return {
    type: "object",
    properties: { _body: { type: "object", description: "JSON request body" } },
  };
}

function buildOutputJsonSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      allowed: { type: "boolean" },
      summary: { type: "string" },
      securityGrade: { type: "string" },
      riskScore: { type: "number" },
    },
    additionalProperties: true,
  };
}

/** CDP / AgentCash Bazaar v2: schema.properties.input + schema.properties.output */
export function buildBazaarExtension(
  path: string,
  method: string,
  inputExample: unknown,
): { info: Record<string, unknown>; schema: JsonSchema } {
  const upper = method.toUpperCase();
  const inputSchema = buildInputJsonSchema(path, method, inputExample);
  const outputSchema = buildOutputJsonSchema();

  const info =
    upper === "GET"
      ? {
          input: {
            type: "http",
            method: "GET",
            queryParams:
              path === "/api/attestation/registry"
                ? { minGrade: "C", limit: 20 }
                : {},
          },
          output: {
            type: "json",
            example: { ok: true, count: 0, records: [] },
          },
        }
      : {
          input: {
            type: "http",
            method: "POST",
            bodyType: "json",
            body: inputExample ?? {},
          },
          output: {
            type: "json",
            example: { ok: true, allowed: true },
          },
        };

  return {
    info,
    schema: {
      type: "object",
      properties: {
        input: inputSchema,
        output: outputSchema,
      },
      required: ["input", "output"],
    },
  };
}

export function bazaarExtensionForRequest(req: Request): {
  info: Record<string, unknown>;
  schema: JsonSchema;
} {
  const example = VERIFY_EXAMPLES[req.path];
  return buildBazaarExtension(req.path, req.method, example);
}
