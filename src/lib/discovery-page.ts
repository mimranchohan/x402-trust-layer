/** Human-readable discovery page — avoids sending browsers to raw /.well-known/x402 JSON. */
export function renderDiscoveryPage(manifest: object, baseUrl: string): string {
  const json = JSON.stringify(manifest, null, 2)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>x402 Discovery Manifest — x402 Trust Layer</title>
<meta name="description" content="x402 Trust Layer discovery manifest — 31 verified payable resource URLs for agents and scanners."/>
<link rel="icon" type="image/svg+xml" href="/assets/x402-trustlayer-logo.svg"/>
<link rel="stylesheet" href="/landing.css?v=4"/>
</head>
<body>
<div class="grid-bg"></div>
<header class="nav">
  <div class="nav-shell">
    <a class="brand" href="/"><img src="/assets/x402-trustlayer-logo.svg" alt=""/><span class="brand-text">x402<span class="dim">trustlayer</span></span></a>
    <nav class="nav-menu">
      <a href="/">Home</a>
      <a href="/openapi.json">OpenAPI</a>
      <a href="/health">Status</a>
    </nav>
  </div>
</header>
<section class="pad" style="padding-top:48px">
  <div class="wrap" style="max-width:900px">
    <p class="kicker">Discovery</p>
    <h2 style="font-size:clamp(24px,4vw,36px);margin-bottom:12px">x402 manifest</h2>
    <p class="section-desc" style="max-width:100%;margin-bottom:24px">
      Machine-readable catalog for x402scan, Agentic Market, and OpenDexter.
      Crawlers should use <code class="mono">GET /.well-known/x402</code> directly.
    </p>
    <div class="tag-row" style="margin-bottom:20px">
      <span class="tag mono">31 resources</span>
      <span class="tag mono">100% verified</span>
      <span class="tag mono">Base · Solana</span>
    </div>
    <div class="terminal-panel">
      <div class="term-chrome">
        <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
        <span class="term-title mono">/.well-known/x402</span>
      </div>
      <pre class="code-block mono" style="margin:0;border:none;border-radius:0;max-height:60vh;overflow:auto">${json}</pre>
    </div>
    <div class="hero-actions" style="justify-content:flex-start;margin-top:24px">
      <button type="button" class="btn solid" id="copy-json">Copy JSON</button>
      <a class="btn ghost" href="${baseUrl}/.well-known/x402" rel="nofollow">Raw JSON endpoint</a>
      <a class="btn ghost" href="${baseUrl}/x402/api/discover">Full catalog</a>
    </div>
    <p class="section-desc" style="margin-top:20px;font-size:12px">
      Register individual paid URLs from <code>resources[]</code> on x402scan — not this catalog URL.
    </p>
  </div>
</section>
<script>
document.getElementById("copy-json")?.addEventListener("click", function () {
  var text = document.querySelector("pre.code-block")?.textContent || "";
  navigator.clipboard.writeText(text).then(function () {
    var b = document.getElementById("copy-json");
    if (b) { b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = "Copy JSON"; }, 2000); }
  });
});
</script>
</body>
</html>`;
}
