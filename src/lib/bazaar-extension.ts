import type { Request } from "express";
import { listEndpoints } from "../routes.js";
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

function declaredHttpMethod(path: string): string {
  const entry = listEndpoints().find((e) => e.path.endsWith(path));
  return entry?.path.split(" ")[0] ?? "POST";
}

function defaultOutputExample(path: string): Record<string, unknown> {
  if (path === "/api/attestation/registry") {
    return { count: 0, records: [], policy: "Attestation registry entries" };
  }
  if (path.includes("attestation")) {
    return { ok: true, attestation: { attestationId: "att_example", allowed: true } };
  }
  if (path.includes("mpp")) {
    return { ok: true, session: { sessionId: "mpp_example", status: "open" } };
  }
  return { ok: true, allowed: true, summary: "Paid response after x402 settlement" };
}

/**
 * AgentCash @agentcash/discovery extractSchemas2 expects:
 * - schema.properties.input.properties.body (POST JSON body schema), or
 * - schema.properties.input.properties.queryParams (GET query schema)
 * - schema.properties.output.properties.example (response example object)
 */
function buildInputSchemaProperty(
  path: string,
  method: string,
  inputExample: unknown,
): JsonSchema {
  if (method.toUpperCase() === "GET") {
    const querySchema =
      path === "/api/attestation/registry"
        ? {
            type: "object",
            properties: {
              minGrade: { type: "string", description: "Minimum security grade (A–F)" },
              agentId: { type: "string", description: "Filter by agent id" },
              limit: { type: "integer", description: "Max records to return" },
            },
          }
        : { type: "object", properties: {} };
    return {
      type: "object",
      properties: { queryParams: querySchema },
      required: ["queryParams"],
    };
  }

  const bodySchema =
    inputExample && typeof inputExample === "object"
      ? exampleToJsonSchema(inputExample)
      : { type: "object", properties: {} };

  return {
    type: "object",
    properties: { body: bodySchema },
    required: ["body"],
  };
}

function buildOutputSchemaProperty(path: string): JsonSchema {
  return {
    type: "object",
    properties: {
      example: defaultOutputExample(path),
    },
    required: ["example"],
  };
}

function buildBazaarInfo(
  path: string,
  method: string,
  inputExample: unknown,
): Record<string, unknown> {
  if (method.toUpperCase() === "GET") {
    return {
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
        example: defaultOutputExample(path),
      },
    };
  }
  return {
    input: {
      type: "http",
      method: "POST",
      bodyType: "json",
      body: inputExample ?? {},
    },
    output: {
      type: "json",
      example: defaultOutputExample(path),
    },
  };
}

/** CDP / AgentCash Bazaar v2 extension payload */
export function buildBazaarExtension(
  path: string,
  method: string,
  inputExample: unknown,
): { info: Record<string, unknown>; schema: JsonSchema } {
  return {
    info: buildBazaarInfo(path, method, inputExample),
    schema: {
      type: "object",
      properties: {
        input: buildInputSchemaProperty(path, method, inputExample),
        output: buildOutputSchemaProperty(path),
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
  const method = declaredHttpMethod(req.path);
  return buildBazaarExtension(req.path, method, example);
}
