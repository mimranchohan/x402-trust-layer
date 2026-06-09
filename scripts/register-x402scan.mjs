const ORIGIN = process.argv[2] || "https://x402trustlayer.xyz";
const BASE = "https://www.x402scan.com/api/trpc";

function encodeInput(json) {
  return encodeURIComponent(JSON.stringify({ json }));
}

async function callGet(proc) {
  const url = `${BASE}/${proc}?input=${encodeInput({ origin: ORIGIN })}`;
  const res = await fetch(url);
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function callPost(proc) {
  const res = await fetch(`${BASE}/${proc}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { origin: ORIGIN } }),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function call(proc, method = "GET") {
  const result = method === "POST" ? await callPost(proc) : await callGet(proc);
  if (result.status === 405 && method === "POST") {
    return callGet(proc);
  }
  return result;
}

console.log("Origin:", ORIGIN);
console.log("\n--- checkDiscovery ---");
console.log(JSON.stringify(await call("public.resources.checkDiscovery"), null, 2));
console.log("\n--- registerFromOrigin ---");
console.log(JSON.stringify(await call("public.resources.registerFromOrigin", "POST"), null, 2));
