import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.argv[2] || "https://x402trustlayer.xyz";
const openapi = JSON.parse(readFileSync(join(root, "openapi.json"), "utf8"));
const paidPaths = Object.keys(openapi.paths).filter((p) => {
  const op = openapi.paths[p]?.post ?? openapi.paths[p]?.get;
  return op && typeof op === "object" && "x-payment-info" in op;
});
const skills = await fetch(
  `https://x402gle.com/servers/${new URL(origin).hostname}/skills.json`,
).then((r) => r.json());
const listed = new Set(
  (skills.skills ?? [])
    .map((s) => {
      try {
        return new URL(String(s.resource_url)).pathname;
      } catch {
        return "";
      }
    })
    .filter(Boolean),
);
const missing = paidPaths.filter((p) => !listed.has(p));
console.log(JSON.stringify({ paid: paidPaths.length, listed: listed.size, missing: missing.length, paths: missing }, null, 2));
