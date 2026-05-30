const ORIGIN = process.argv[2] || "https://x402-agent-suite-production.up.railway.app";
const BASE = "https://www.x402scan.com/api/trpc";

async function call(proc) {
  const res = await fetch(`${BASE}/${proc}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { origin: ORIGIN } }),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

console.log("Origin:", ORIGIN);
console.log("\n--- checkDiscovery ---");
console.log(JSON.stringify(await call("public.resources.checkDiscovery"), null, 2));
console.log("\n--- registerFromOrigin ---");
console.log(JSON.stringify(await call("public.resources.registerFromOrigin"), null, 2));
