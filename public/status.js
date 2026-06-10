(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

  function card(k, v, cls) {
    return '<div class="card"><div class="k">' + esc(k) + '</div><div class="v">' +
      (cls ? '<span class="' + cls + '">' + esc(v) + '</span>' : esc(v)) + '</div></div>';
  }

  function render(h) {
    var ok = h && h.ok === true && h.db === "ok" && h.disk === "ok";
    var lamp = $("#lamp"), word = $("#status-word");
    lamp.className = "lamp " + (ok ? "ok" : "bad");
    word.textContent = ok ? "All systems operational" : "Degraded — see details";
    $("#updated").textContent = "Last checked " + new Date().toLocaleTimeString() +
      (h.gitCommit ? " · build " + h.gitCommit : "");

    var fac = h.facilitator || "—";
    try { fac = new URL(fac).host; } catch (e) {}
    var chains = Array.isArray(h.chains) ? h.chains.join(" · ") : "—";

    $("#cards").innerHTML =
      card("Service", h.ok ? "online" : "down", h.ok ? "ok" : "bad") +
      card("Version", "v" + (h.version || "?")) +
      card("Endpoints", h.endpointCount || "?") +
      card("Database", h.db || "?", h.db === "ok" ? "ok" : "bad") +
      card("Disk", h.disk || "?", h.disk === "ok" ? "ok" : "bad") +
      card("Facilitator", fac) +
      card("Nonce backend", h.nonceBackend || "?") +
      card("Chains", chains);

    var ki = h.settlementGuidance && h.settlementGuidance.knownUpstreamIssue;
    var kiBox = $("#known-issue");
    if (ki) { kiBox.style.display = "block"; kiBox.innerHTML = "<strong>Known upstream note:</strong> " + esc(ki); }
    else { kiBox.style.display = "none"; }
  }

  function load() {
    fetch("/health", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () {
        $("#lamp").className = "lamp bad";
        $("#status-word").textContent = "Unreachable";
        $("#err").innerHTML = '<div class="err">Could not reach /health. The service may be down or deploying.</div>';
      });
  }
  load();
  setInterval(load, 30000);
})();
