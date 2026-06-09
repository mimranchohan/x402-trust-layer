import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../data/facilitator-supported.json");

async function download() {
  console.log("Downloading from https://x402.dexter.cash/supported...");
  const res = await fetch("https://x402.dexter.cash/supported");
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }
  const body = await res.json();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(body, null, 2), "utf8");
  console.log(`Successfully cached facilitator data to ${outPath}`);
}

download().catch(console.error);
