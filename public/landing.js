(function () {
  const BASE = window.location.origin;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let catalog = null;
  let activeTier = "all";
  let searchQuery = "";
  let activeView = "terminal";
  let heroIdx = 0;
  let heroTimer = null;

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
    return (arr || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("");
  }

  function filteredAgents() {
    if (!catalog) return [];
    const q = searchQuery.toLowerCase();
    return catalog.agents.filter((a) => {
      if (activeTier !== "all" && a.tier !== activeTier) return false;
      if (!q) return true;
      const hay = (a.name + a.path + a.summary + a.tags.join(" ") + a.tierLabel).toLowerCase();
      return hay.includes(q);
    });
  }

  function priceFmt(n) {
    return "$" + Number(n).toFixed(2);
  }

  function renderTerminalRow(a) {
    return `
<div class="term-row" data-id="${esc(a.id)}" role="button" tabindex="0">
  <div class="method">${esc(a.method)}</div>
  <div>
    <div class="path-main">${esc(a.path)}</div>
    <div class="path-name">${esc(a.name)}</div>
    <div class="tier-tag">${esc(a.tierLabel)} · ${esc(a.layer)}</div>
  </div>
  <div class="price-tag">${priceFmt(a.price)}</div>
</div>`;
  }

  function renderCard(a) {
    const color = TIER_COLORS[a.tier] || "#16C7C0";
    return `
<article class="api-card" data-id="${esc(a.id)}" role="button" tabindex="0">
  <div class="api-card-head">
    <div class="api-tier" style="border-color:${color};color:${color}">${esc(a.tierLabel)}</div>
    <div class="api-price">${priceFmt(a.price)}</div>
  </div>
  <h3 class="api-name">${esc(a.name)}</h3>
  <div class="api-route mono">${esc(a.method)} ${esc(a.path)}</div>
  <p class="api-summary">${esc(a.summary)}</p>
</article>`;
  }

  function renderDetail(a) {
    const url = `${BASE}${a.path}`;
    const color = TIER_COLORS[a.tier] || "#16C7C0";
    const body =
      a.method === "GET"
        ? `curl ${esc(url)}`
        : `curl -X ${esc(a.method)} ${esc(url)} \\\n  -H "content-type: application/json" \\\n  -d '{}'`;

    return `
<div class="detail-head">
  <div>
    <div class="api-tier" style="border-color:${color};color:${color};display:inline-block;margin-bottom:8px">${esc(a.tierLabel)}</div>
    <h3>${esc(a.name)}</h3>
    <div class="detail-route mono">${esc(a.method)} ${esc(a.path)} · layer: ${esc(a.layer)}</div>
  </div>
  <div class="detail-price">${priceFmt(a.price)}</div>
</div>
<div class="detail-block">
  <h4>Summary</h4>
  <p>${esc(a.summary)}</p>
</div>
<div class="detail-block">
  <h4>Why it matters</h4>
  <p>${esc(a.why)}</p>
</div>
<div class="detail-block">
  <h4>Key inputs</h4>
  <div class="chips">${chips(a.inputs)}</div>
</div>
<div class="detail-block">
  <h4>Response highlights</h4>
  <div class="chips">${chips(a.outputs)}</div>
</div>
<div class="detail-block">
  <h4>Tags</h4>
  <div class="chips">${chips(a.tags)}</div>
</div>
<div class="detail-block">
  <h4>Docs</h4>
  <p style="font-size:13px;color:var(--muted)"><a href="/skill.md">skill.md</a> · <a href="/openapi.json">OpenAPI</a> · <a href="?agent=${esc(a.id)}">Permalink</a></p>
</div>
<div class="detail-block">
  <h4>Example call</h4>
  <pre class="code-block">${body}</pre>
  <p style="font-size:12px;color:var(--dim);margin-top:8px">Returns HTTP 402 first — pay with x402 USDC, then retry with X-Payment header.</p>
</div>`;
  }

  function openDetail(id) {
    const a = catalog.agents.find((x) => x.id === id);
    if (!a) return;
    const panel = $("#agent-detail");
    const content = $("#detail-content");
    if (!panel || !content) return;
    content.innerHTML = renderDetail(a);
    panel.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeDetail() {
    const panel = $("#agent-detail");
    if (!panel) return;
    panel.classList.add("hidden");
    document.body.style.overflow = "";
  }

  function bindAgentClicks(root) {
    if (!root) return;
    root.addEventListener("click", (e) => {
      const row = e.target.closest("[data-id]");
      if (!row) return;
      openDetail(row.dataset.id);
    });
    root.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const row = e.target.closest("[data-id]");
      if (!row) return;
      e.preventDefault();
      openDetail(row.dataset.id);
    });
  }

  function renderViews() {
    const agents = filteredAgents();
    const termList = $("#terminal-list");
    const cards = $("#view-cards");
    const count = $("#api-count");

    if (count) count.textContent = String(agents.length);

    if (termList) {
      termList.innerHTML =
        agents.length === 0
          ? `<div class="term-row"><div></div><div>No agents match your filter.</div><div></div></div>`
          : agents.map(renderTerminalRow).join("");
    }

    if (cards) {
      cards.innerHTML =
        agents.length === 0
          ? `<p style="color:var(--muted);padding:24px">No agents match your filter.</p>`
          : agents.map(renderCard).join("");
    }
  }

  function setView(view) {
    activeView = view;
    const term = $("#view-terminal");
    const cards = $("#view-cards");
    $$(".vt").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    if (term) term.classList.toggle("hidden", view !== "terminal");
    if (cards) cards.classList.toggle("hidden", view !== "cards");
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
        const label = t === "all" ? "All 31" : labels[t] || t;
        const active = t === activeTier ? " active" : "";
        return `<button type="button" class="tier-pill${active}" data-tier="${t}">${esc(label)}</button>`;
      })
      .join("");
    nav.onclick = (e) => {
      const btn = e.target.closest("[data-tier]");
      if (!btn) return;
      activeTier = btn.dataset.tier;
      $$(".tier-pill", nav).forEach((b) => b.classList.toggle("active", b === btn));
      renderViews();
    };
  }

  function renderLayers(layers) {
    const el = $("#layers-grid");
    if (!el || !layers) return;
    el.innerHTML = layers
      .map(
        (l) => `
<div class="layer-card">
  <div class="layer-num">${esc(l.num)} · ${esc(l.title)}</div>
  <h3>${esc(l.title)}</h3>
  <p>${esc(l.desc)}</p>
</div>`,
      )
      .join("");
  }

  function setStatsImmediate(agents) {
    const endpoints = agents?.length ?? 31;
    const elEndpoints = $("#s-endpoints");
    const elVerified = $("#s-verified");
    const elChains = $("#s-chains");
    if (elEndpoints) {
      elEndpoints.textContent = String(endpoints);
      elEndpoints.dataset.count = String(endpoints);
    }
    if (elVerified) {
      elVerified.textContent = "100%";
      elVerified.dataset.count = "100";
    }
    if (elChains) {
      elChains.textContent = "3";
      elChains.dataset.count = "3";
    }
    updateCheapest(agents ?? []);
  }

  function animateCounters() {
    $$("[data-count]").forEach((el) => {
      const target = parseInt(el.dataset.count, 10);
      if (Number.isNaN(target)) return;
      const isPct = el.id === "s-verified";
      const duration = 1200;
      const start = performance.now();
      function tick(now) {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = Math.round(target * eased);
        el.textContent = isPct ? val + "%" : String(val);
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  function observeStats() {
    const stats = $("#stats");
    if (!stats) {
      animateCounters();
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            animateCounters();
            obs.disconnect();
          }
        });
      },
      { threshold: 0.3 },
    );
    obs.observe(stats);
  }

  function startHeroTerminal(agents) {
    const el = $("#hero-terminal");
    if (!el || !agents.length) return;
    const sample = agents.slice().sort((a, b) => a.path.localeCompare(b.path));

    function paint() {
      const lines = [];
      for (let i = 0; i < 5; i++) {
        const a = sample[(heroIdx + i) % sample.length];
        lines.push(
          `<div class="term-line"><span class="path">${esc(a.method)} ${esc(a.path)}</span><span class="price">${priceFmt(a.price)}</span></div>`,
        );
      }
      lines.push(`<div><span class="cursor-blink">▊</span></div>`);
      el.innerHTML = lines.join("");
      heroIdx = (heroIdx + 1) % sample.length;
    }

    paint();
    if (heroTimer) clearInterval(heroTimer);
    heroTimer = setInterval(paint, 2800);
  }

  function updateCheapest(agents) {
    const el = $("#s-cheapest");
    if (!el || !agents.length) return;
    const min = Math.min(...agents.map((a) => a.price));
    el.textContent = priceFmt(min);
  }

  async function loadHealth() {
    try {
      const h = await fetch("/health").then((r) => r.json());
      const badge = $("#hero-badge-text");
      if (badge && h.endpointCount) {
        const chainLabel = Array.isArray(h.chains) ? h.chains.join(" · ") : "Base · Solana · Polygon";
        badge.textContent = `${h.endpointCount} Live Endpoints · ${chainLabel}`;
      }
    } catch (_) {}
  }

  async function init() {
    try {
      catalog = await fetch("/data/agents.json").then((r) => r.json());
    } catch {
      const termList = $("#terminal-list");
      if (termList) termList.innerHTML = `<div class="term-row"><div></div><div>Could not load agent catalog.</div><div></div></div>`;
      return;
    }

    renderLayers(catalog.layers);
    renderTiers(catalog.agents);
    setStatsImmediate(catalog.agents);
    renderViews();
    updateCheapest(catalog.agents);
    startHeroTerminal(catalog.agents);
    observeStats();
    loadHealth();

    bindAgentClicks($("#terminal-list"));
    bindAgentClicks($("#view-cards"));

    const search = $("#api-search");
    if (search) {
      search.addEventListener("input", () => {
        searchQuery = search.value.trim();
        renderViews();
      });
    }

    $$(".view-toggle .vt").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    const closeBtn = $("#detail-close");
    const panel = $("#agent-detail");
    if (closeBtn) closeBtn.addEventListener("click", closeDetail);
    if (panel) {
      panel.addEventListener("click", (e) => {
        if (e.target === panel) closeDetail();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDetail();
    });

    const params = new URLSearchParams(window.location.search);
    const hashAgent = window.location.hash.replace(/^#/, "").replace(/^agent[=\/]?/, "");
    const deepId = params.get("agent") || (hashAgent && !hashAgent.startsWith("agents") ? hashAgent : null);
    if (deepId) {
      openDetail(deepId);
      if (params.get("agent")) {
        history.replaceState(null, "", window.location.pathname + "#agents");
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
