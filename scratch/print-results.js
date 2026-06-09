import fs from 'fs';

let raw = fs.readFileSync('x402gle-route-auditions.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) {
  raw = raw.slice(1);
}
const data = JSON.parse(raw);

console.log("Total results in file:", data.results.length);

data.results.forEach((r, idx) => {
  if (!r.raw) {
    console.log(`[${idx}] ${r.path}: no raw CLI output`);
    return;
  }
  
  const start = r.raw.indexOf('{');
  const end = r.raw.lastIndexOf('}');
  if (start < 0 || end < start) {
    console.log(`[${idx}] ${r.path}: invalid JSON structure in raw`);
    return;
  }
  
  try {
    const parsedRaw = JSON.parse(r.raw.slice(start, end + 1));
    const routes = parsedRaw.routes || [];
    if (routes.length === 0) {
      console.log(`[${idx}] ${r.path}: no routes in result`);
      if (parsedRaw.error) {
        console.log(`  Error: ${parsedRaw.error} - ${parsedRaw.message}`);
      }
    } else {
      routes.forEach((route) => {
        console.log(`[${idx}] ${r.path} -> Score: ${route.score}, Status: ${route.status}`);
        if (route.status !== 'pass' || route.score < 75) {
          console.log(`  Verdict: ${route.verdict}`);
          console.log(`  Fix Instructions: ${route.fixInstructions}`);
        }
      });
    }
  } catch (e) {
    console.log(`[${idx}] ${r.path}: error parsing raw JSON: ${e.message}`);
  }
});
