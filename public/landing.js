(function () {
  const BASE = window.location.origin;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let catalog = null;
  let activeTier = "all";
  let searchQuery = "";

  const TIER_COLORS = {
    entry: "#16C7C0",
    marketplace: "#3B82F6",
    orchestration: "#8B5CF6",
    core: "#34D399",
    attestation: "#F5A623",
    trust: "#F97316",
    intelligence: "#A78BFA",
    enterprise: "#E879F9",
    tier1: "#FBBF24",
  };

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function chips(arr) {
    return (arr || [])
      .map((t) => `<span class="chip">${esc(t)}</span>`)
      .join("");
  }

  function renderAgent(a) {
    const url = `${BASE}${a.path}`;
    const color = TIER_COLORS[a.tier] || "#16C7C0";
    return `
<article class="api-card" data-tier="${esc(a.tier)}" data-search="${esc(
      (a.name + " " + a.path + " " + a.tags.join(" ") + " " + a.summary).toLowerCase(),
    )}">
  <div class="api-card-head">
    <div class="api-tier" style="--tc:${color}">${esc(a.tierLabel)}</div>
    <div class="api-price">$${a.price.toFixed(2)}</div>
  </div>
  <h3 class="api-name">${esc(a.name)}</h3>
  <div class="api-route mono">${esc(a.method)} <span>${esc(a.path)}</span></div>
  <p class="api-summary">${esc(a.summary)}</p>
  <details class="api-details">
    <summary>Full specification</summary>
    <div class="api-detail-body">
      <div class="detail-block">
        <h4>Why it matters</h4>
        <p>${esc(a.why)}</p>
      </div>
      <div class="detail-grid">
        <div class="detail-block">
          <h4>Key inputs</h4>
          <div class="chips">${chips(a.inputs)}</div>
        </div>
        <div class="detail-block">
          <h4>Response highlights</h4>
          <div class="chips">${chips(a.outputs)}</div>
        </div>
      </div>
      <div class="detail-block">
        <h4>Tags</h4>
        <div class="chips">${chips(a.tags)}</div>
      </div>
      <div class="detail-block">
        <h4>Example</h4>
        <pre class="code-block">curl -X ${esc(a.method)} ${esc(url)} \\
  -H "content-type: application/json" \\
  -d '{}'</pre>
        <p class="hint">Returns HTTP 402 first — pay with x402 USDC, then retry with X-Payment header.</p>
      </div>
      <div class="api-actions">
        <a class="btn sm" href="/openapi.json" target="_blank" rel="noopener">OpenAPI schema</a>
        <a class="btn sm ghost" href="/.well-known/x402" target="_blank" rel="noopener">Discovery</a>
      </div>
    </div>
  </details>
</article>`;
  }

  function renderCatalog() {
    const grid = $("#api-grid");
    if (!grid || !catalog) return;
    const q = searchQuery.toLowerCase();
    const filtered = catalog.agents.filter((a) => {
      if (activeTier !== "all" && a.tier !== activeTier) return false;
      if (!q) return true;
      const hay = (a.name + a.path + a.summary + a.tags.join(" ")).toLowerCase();
      return hay.includes(q);
    });
    grid.innerHTML =
      filtered.length === 0
        ? `<p class="empty">No agents match your filter.</p>`
        : filtered.map(renderAgent).join("");
    const count = $("#api-count");
    if (count) count.textContent = String(filtered.length);
  }

  function renderTiers(agents) {
    const nav = $("#tier-nav");
    if (!nav) return;
    const tiers = [...new Set(agents.map((a) => a.tier))];
    const labels = {};
    agents.forEach((a) => {
      labels[a.tier] = a.tierLabel;
    });
    const order = [
      "all",
      "entry",
      "tier1",
      "marketplace",
      "orchestration",
      "core",
      "attestation",
      "trust",
      "intelligence",
      "enterprise",
    ];
    nav.innerHTML = order
      .filter((t) => t === "all" || tiers.includes(t))
      .map((t) => {
        const label = t === "all" ? "All agents" : labels[t] || t;
        const active = t === activeTier ? " active" : "";
        return `<button type="button" class="tier-pill${active}" data-tier="${t}">${esc(label)}</button>`;
      })
      .join("");
    nav.onclick = (e) => {
      const btn = e.target.closest("[data-tier]");
      if (!btn) return;
      activeTier = btn.dataset.tier;
      $$(".tier-pill", nav).forEach((b) => b.classList.toggle("active", b === btn));
      renderCatalog();
    };
  }

  function renderLayers(layers) {
    const el = $("#layers-grid");
    if (!el || !layers) return;
    el.innerHTML = layers
      .map(
        (l) => `
<div class="layer-card">
  <div class="layer-num">${esc(l.num)}</div>
  <h3>${esc(l.title)}</h3>
  <p>${esc(l.desc)}</p>
</div>`,
      )
      .join("");
  }

  async function loadHealth() {
    try {
      const h = await fetch("/health").then((r) => r.json());
      if (h.endpointCount) $("#m-endpoints").textContent = h.endpointCount;
      if (h.version) $("#m-version").textContent = "v" + h.version;
      if (h.chains) $("#m-chains").textContent = h.chains.join(" + ");
    } catch (_) {}
  }

  async function init() {
    try {
      catalog = await fetch("/data/agents.json").then((r) => r.json());
    } catch {
      $("#api-grid").innerHTML = `<p class="empty">Could not load agent catalog.</p>`;
      return;
    }
    document.title = catalog.product + " — " + catalog.tagline;
    const sub = $("#hero-sub");
    if (sub) sub.textContent = catalog.tagline + " · " + catalog.domain;
    renderLayers(catalog.layers);
    renderTiers(catalog.agents);
    renderCatalog();
    loadHealth();

    const search = $("#api-search");
    if (search) {
      search.addEventListener("input", () => {
        searchQuery = search.value.trim();
        renderCatalog();
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
