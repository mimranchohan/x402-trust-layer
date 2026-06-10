/* x402 Trust Layer — Agent Features Dashboard
   CSP-safe: external script, no inline handlers, no third-party CDNs. */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var TIER_COLORS = {
    killer: "#16C7C0", entry: "#16C7C0", bundle: "#16C7C0",
    marketplace: "#3B82F6", orchestration: "#8B5CF6", core: "#34D399",
    identity: "#34D399", attestation: "#F5A623", trust: "#F97316",
    intelligence: "#A78BFA", enterprise: "#E879F9", tier1: "#FBBF24",
    protocol: "#A78BFA"
  };
  var LAYER_META = {
    guard:        { num: "01", title: "Guard",         desc: "Preflight spend, identity and URL risk before any payment" },
    attestation:  { num: "02", title: "Attestation",   desc: "Issue, verify and register agent credentials and mandates" },
    compliance:   { num: "03", title: "Compliance",    desc: "Ledgers, evidence, disputes and refund arbitration" },
    settlement:   { num: "04", title: "Settlement Ops",desc: "Rail routing, MPP sessions, escrow and receipt audit" }
  };

  var state = { catalog: null, agents: [], origin: window.location.origin,
                search: "", paid: "all", group: "layer", tier: "all" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function isFree(a) { return !a.price || Number(a.price) === 0; }
  function priceFmt(n) { return isNaN(Number(n)) ? "—" : "$" + Number(n).toFixed(2); }
  function showError(msg) {
    var b = $("#error-box");
    if (b) b.innerHTML = '<div class="err">' + esc(msg) + "</div>";
  }

  function curlFor(a) {
    var url = state.origin + a.path;
    if ((a.method || "GET") === "GET") return "curl " + url;
    return "curl -X " + a.method + " " + url +
      ' \\\n  -H "content-type: application/json" \\\n  -d \'{}\'';
  }

  /* ---------- filtering ---------- */
  function filtered() {
    var q = state.search.toLowerCase();
    return state.agents.filter(function (a) {
      if (state.paid === "paid" && isFree(a)) return false;
      if (state.paid === "free" && !isFree(a)) return false;
      if (state.tier !== "all" && a.tier !== state.tier) return false;
      if (!q) return true;
      var hay = [a.name, a.path, a.summary, a.tierLabel, a.layer,
        (a.tags || []).join(" ")].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  /* ---------- stats ---------- */
  function renderStats(health) {
    var all = state.agents;
    var total = (health && health.endpointCount) ? health.endpointCount : all.length;
    var free = all.filter(isFree).length;
    var paid = all.length - free;
    var prices = all.filter(function (a) { return !isFree(a); }).map(function (a) { return Number(a.price); });
    var min = prices.length ? Math.min.apply(null, prices) : 0;
    var sum = prices.reduce(function (x, y) { return x + y; }, 0);
    var chains = (health && Array.isArray(health.chains)) ? health.chains : ["base", "solana", "polygon"];

    $("#st-total").textContent = String(total);
    $("#st-paid").innerHTML = String(paid) + ' <small>in catalog</small>';
    $("#st-free").textContent = String(free);
    $("#st-min").textContent = priceFmt(min);
    $("#st-sum").textContent = priceFmt(sum);
    $("#st-chains").innerHTML = String(chains.length) + ' <small>' + esc(chains.join(" · ")) + "</small>";
  }

  function renderMeta(health) {
    if (!health) return;
    var fac = health.facilitator || "—";
    try { fac = new URL(fac).host; } catch (e) {}
    var bits = [
      ["Version", health.version || "—"],
      ["Protocol", health.protocol || "—"],
      ["Facilitator", fac],
      ["Nonce backend", health.nonceBackend || "—"],
      ["Commit", health.gitCommit || "local"],
      ["DB", (health.db || "?") + " / disk " + (health.disk || "?")]
    ];
    $("#meta-strip").innerHTML = bits.map(function (p) {
      return '<span class="pill">' + esc(p[0]) + ": <b>" + esc(p[1]) + "</b></span>";
    }).join("");
  }

  /* ---------- bars (CSS, no chart lib) ---------- */
  function renderBars() {
    var byLayer = {};
    state.agents.forEach(function (a) {
      var L = a.layer || "other";
      byLayer[L] = (byLayer[L] || 0) + 1;
    });
    var keys = Object.keys(byLayer);
    if (!keys.length) return;
    var max = Math.max.apply(null, keys.map(function (k) { return byLayer[k]; }));
    var order = ["guard", "attestation", "compliance", "settlement"];
    keys.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    $("#bars").innerHTML = keys.map(function (k) {
      var meta = LAYER_META[k];
      var label = meta ? meta.title : k;
      var pct = Math.round((byLayer[k] / max) * 100);
      return '<div class="bar-row"><div class="lbl">' + esc(label) +
        '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct +
        '%"></div></div><div class="val">' + byLayer[k] + "</div></div>";
    }).join("");
    $("#barwrap").style.display = "block";
  }

  /* ---------- tier nav ---------- */
  function renderTierNav() {
    var tiers = {};
    state.agents.forEach(function (a) { tiers[a.tier] = a.tierLabel || a.tier; });
    var order = ["all", "killer", "entry", "bundle", "tier1", "protocol",
      "orchestration", "core", "identity", "attestation", "trust",
      "intelligence", "enterprise"];
    var keys = order.filter(function (t) { return t === "all" || tiers[t]; });
    Object.keys(tiers).forEach(function (t) { if (keys.indexOf(t) === -1) keys.push(t); });
    $("#tier-nav").innerHTML = keys.map(function (t) {
      var label = t === "all" ? "All tiers" : (tiers[t] || t);
      var active = t === state.tier ? " active" : "";
      return '<button type="button" class="pill-btn' + active + '" data-tier="' +
        esc(t) + '">' + esc(label) + "</button>";
    }).join("");
  }

  /* ---------- card ---------- */
  function card(a) {
    var color = TIER_COLORS[a.tier] || "#16C7C0";
    var priceCls = isFree(a) ? "price free" : "price";
    var priceTxt = isFree(a) ? "FREE" : priceFmt(a.price);
    var tags = (a.tags || []).slice(0, 5).map(function (t) {
      return '<span class="chip">' + esc(t) + "</span>";
    }).join("");
    return '' +
      '<article class="card">' +
        '<div class="card-top">' +
          '<span class="tier-chip" style="border-color:' + color + ';color:' + color + '">' + esc(a.tierLabel || a.tier) + "</span>" +
          '<span class="' + priceCls + '">' + priceTxt + "</span>" +
        "</div>" +
        "<h3>" + esc(a.name) + "</h3>" +
        '<div class="route"><span class="m">' + esc(a.method) + "</span> " + esc(a.path) + "</div>" +
        '<p class="summary">' + esc(a.summary || "") + "</p>" +
        '<div class="chips">' + tags + "</div>" +
        '<div class="card-actions">' +
          '<button type="button" class="btn" data-curl="' + esc(a.id) + '">Copy curl</button>' +
          '<a class="btn" href="/openapi.json" target="_blank" rel="noopener">Schema</a>' +
        "</div>" +
      "</article>";
  }

  function groupHead(num, title, desc, count) {
    return '<div class="layer-head"><span class="layer-num">' + esc(num) +
      '</span><h2>' + esc(title) + '</h2><span class="ct">' + count +
      ' endpoint' + (count === 1 ? "" : "s") + '</span></div>' +
      (desc ? '<p class="layer-desc">' + esc(desc) + "</p>" : "");
  }

  function render() {
    var list = filtered();
    var root = $("#catalog");
    if (!list.length) {
      root.innerHTML = '<div class="empty">No features match your filters.</div>';
      return;
    }
    var html = "";
    if (state.group === "layer") {
      var order = ["guard", "attestation", "compliance", "settlement"];
      var groups = {};
      list.forEach(function (a) {
        var L = a.layer || "other";
        (groups[L] = groups[L] || []).push(a);
      });
      var keys = Object.keys(groups).sort(function (a, b) {
        var ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      keys.forEach(function (k) {
        var meta = LAYER_META[k] || { num: "··", title: k, desc: "" };
        html += '<section class="layer-section">' +
          groupHead(meta.num, meta.title, meta.desc, groups[k].length) +
          '<div class="grid">' + groups[k].map(card).join("") + "</div></section>";
      });
    } else {
      var byTier = {};
      list.forEach(function (a) { (byTier[a.tier] = byTier[a.tier] || []).push(a); });
      Object.keys(byTier).forEach(function (t) {
        var label = byTier[t][0].tierLabel || t;
        html += '<section class="layer-section">' +
          groupHead("··", label, "", byTier[t].length) +
          '<div class="grid">' + byTier[t].map(card).join("") + "</div></section>";
      });
    }
    root.innerHTML = html;
  }

  /* ---------- clipboard ---------- */
  function copyCurl(id, btn) {
    var a = state.agents.find(function (x) { return x.id === id; });
    if (!a) return;
    var text = curlFor(a);
    var done = function () {
      var orig = btn.textContent;
      btn.textContent = "Copied ✓";
      btn.classList.add("copied");
      setTimeout(function () { btn.textContent = orig; btn.classList.remove("copied"); }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------- events ---------- */
  function bind() {
    $("#search").addEventListener("input", function (e) {
      state.search = e.target.value.trim(); render();
    });
    $("#paid-seg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-paid]"); if (!b) return;
      state.paid = b.dataset.paid;
      [].forEach.call(this.children, function (c) { c.classList.toggle("active", c === b); });
      render();
    });
    $("#group-seg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-group]"); if (!b) return;
      state.group = b.dataset.group;
      [].forEach.call(this.children, function (c) { c.classList.toggle("active", c === b); });
      render();
    });
    $("#tier-nav").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tier]"); if (!b) return;
      state.tier = b.dataset.tier;
      [].forEach.call(this.querySelectorAll(".pill-btn"), function (c) {
        c.classList.toggle("active", c === b);
      });
      render();
    });
    $("#catalog").addEventListener("click", function (e) {
      var b = e.target.closest("[data-curl]"); if (!b) return;
      copyCurl(b.dataset.curl, b);
    });
  }

  /* ---------- boot ---------- */
  function init() {
    bind();
    fetch("/data/agents.json").then(function (r) { return r.json(); }).then(function (cat) {
      state.catalog = cat;
      state.agents = (cat && Array.isArray(cat.agents)) ? cat.agents : [];
      renderStats(null);
      renderBars();
      renderTierNav();
      render();
      return fetch("/health").then(function (r) { return r.json(); });
    }).then(function (health) {
      renderStats(health);
      renderMeta(health);
      var lt = $("#live-text");
      if (lt && health) {
        var chains = Array.isArray(health.chains) ? health.chains.join(" · ") : "Base · Solana · Polygon";
        lt.textContent = "v" + (health.version || "?") + " · " +
          (health.endpointCount || state.agents.length) + " live · " + chains;
      }
    }).catch(function (err) {
      showError("Could not load agent catalog or /health. " + (err && err.message ? err.message : ""));
      var lt = $("#live-text"); if (lt) lt.textContent = "offline";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
