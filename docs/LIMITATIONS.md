# Known limitations (integrator truth sheet)

This document answers common GitHub / security-review questions about **x402 Trust Layer**. It reflects the **current codebase** (v5.1+), not older “JSON-only” descriptions.

---

## 1. Persistence — JSON vs SQLite vs Postgres

### Status: **partially migrated** (SQLite primary; some JSON legacy)

| Data | Storage today | Notes |
|------|----------------|-------|
| Mandates, attestations, spend ledger, nonces (DB table), idempotency, webhooks, MPP sessions, escrow records, protocol KV, telemetry | **SQLite** (`trust-layer.db` under `DATA_DIR`, WAL mode) | Atomic writes per connection; suitable for single Railway instance + volume |
| Agent escrow (`/api/agent-escrow`) | **SQLite** + optional sync to `escrow-ledger.json` | JSON path still exists for legacy reads — prefer DB |
| Certified sellers registry | `data/certified-sellers.json` | File-based; low write rate |
| Protocol legacy snapshots | `data/protocol/*.json` (fallback in `protocol/store.ts`) | New writes go to SQLite `protocol_kv` |

**Production risk (old docs):** Concurrent writers corrupting flat JSON — **mitigated** for core paths by SQLite. Remaining JSON files should not be edited by multiple processes.

**When to use Postgres:** Multi-instance horizontal scale, cross-region replicas, compliance archive, or fleet-wide spend analytics. See [ROADMAP.md](./ROADMAP.md) and [PLAN-TRUST-STACK-2026.md](./PLAN-TRUST-STACK-2026.md).

**Operator checklist:**

- Mount Railway volume at `/app/data` (see [RAILWAY-DEPLOY.md](./RAILWAY-DEPLOY.md))
- Back up `trust-layer.db` on a schedule
- Plan Postgres migration before running **multiple** stateful app replicas

---

## 2. No 100% accuracy guarantee

### Status: **documented + enforced in API shape**

- Every paid agent response includes `confidence` (0–1), `checks_passed`, `sources`, and `accuracy_note` via `src/lib/agent-response.ts`.
- Default note: *“Heuristic preflight only — not a guarantee of downstream API quality or settlement success.”*
- [INTEGRATE.md](./INTEGRATE.md) states explicitly: **We do not guarantee 100% accuracy.**
- Trust scores (merchant KYM, TrustScore v2, credit bureau) are **estimates** for agent decision support, not legal or financial truth.

**Integrator pattern:** Treat `recommendation: "pay"` as one signal; combine with your own policy, human approval, and on-chain receipt verification (`/api/receipt-auditor/verify`).

---

## 3. Centralized trust oracle (availability)

### Status: **accurate — centralized HTTPS service**

- Preflight runs against `https://x402trustlayer.xyz` (or your self-hosted fork).
- If the service is down, agents cannot obtain fresh guard/mandate/KYM results over the network.
- There is **no on-chain decentralized fallback** for Trust Layer judgement today.

**Mitigations (client-side, recommended):**

1. **Fail closed or open explicitly** — Decide fleet policy when guard times out (block pay vs allow with local caps).
2. **Cache** last successful guard/mandate per `(agentId, targetHost)` with TTL.
3. **Local policy** — Enforce `perCallCapUsdc` / `dailyCapUsdc` in your orchestrator without calling the API.
4. **Self-host** — Run the same Docker image on your infra; point agents at your URL.
5. **Health** — Monitor `GET /health` (`db`, `endpointCount`).

Protocol routes (`/api/protocol/oracle/consensus`) simulate quorum for **scoring transparency**; they do not replace infrastructure HA.

---

## 4. HMAC secret management (`ATTESTATION_HMAC_SECRET`)

### Status: **documented rotation; no automatic key versioning**

- Attestations and mandates use server-only **HMAC-SHA256** (`ATTESTATION_HMAC_SECRET`, min 32 chars in production).
- If the secret leaks, an attacker can forge attestations until you rotate.

**Rotation procedure** ([SECURITY.md](./SECURITY.md)):

1. Generate new secret: `openssl rand -hex 32`
2. Set new `ATTESTATION_HMAC_SECRET` on Railway → redeploy
3. **Invalidate** all prior attestations (signatures no longer verify)
4. Re-issue attestations for active agents
5. Audit logs for suspicious `POST /api/attestation/issue` volume

**Not implemented yet:** dual-key grace period (`SECRET_CURRENT` + `SECRET_PREVIOUS`), automated rotation cron, or HSM integration — roadmap for enterprise fleets.

Also rotate: `WEBHOOK_ADMIN_SECRET`, `X402GLE_CHALLENGE_TOKEN` (after domain verify), and receive wallets if payer keys leaked.

---

## 5. Wash-trade detection is heuristic

### Status: **accurate — not on-chain graph analysis**

`POST /api/merchant-trust/score`:

- Uses **client-supplied** or **ingested telemetry** (`washTradePct`, `observedTxns`, `observedVolumeUsdc`, verification ratios) and optional **live 402 probe**.
- May enrich from ecosystem APIs (e.g. x402watch-style hints via `fetchHostTelemetry`) — still **observed/market data**, not full on-chain wash-trade forensics.
- Penalizes high wash % and spam-like volume patterns; outputs `washTradeRisk: low | medium | high`.
- `accuracy_note` on response: *“KYM trust is a pre-payment heuristic… not a guarantee of settlement quality.”*

**Does not:** Prove or disprove wash trading on-chain; replace compliance/KYT vendors; or guarantee merchant honesty.

**Integrator pattern:** Pass your own telemetry; treat grade **F** / `avoid` as hard block in fleet policy; use `probe: true` for unknown hosts.

---

## Summary table

| # | Concern | Addressed? | Action |
|---|---------|------------|--------|
| 1 | JSON persistence / corruption | **Mostly** (SQLite) | Remove remaining JSON writers over time; Postgres at scale |
| 2 | 100% accuracy | **Yes** (disclaimers + fields) | Read `accuracy_note`; don’t auto-pay on score alone |
| 3 | Centralized SPOF | **Yes** (by design) | Cache, self-host, fail-closed policy |
| 4 | HMAC leak / rotation | **Documented** | Rotate secret; plan dual-key later |
| 5 | Wash-trade truth | **Heuristic** | Supply data; don’t treat as on-chain proof |

---

## Related docs

- [SECURITY.md](./SECURITY.md) — controls + incident response  
- [ARCHITECTURE.md](./ARCHITECTURE.md) — request flow and persistence map  
- [INTEGRATE.md](./INTEGRATE.md) — buyer integration + accuracy policy  
- [PRODUCTION-HARDENING.md](./PRODUCTION-HARDENING.md) — what shipped in v5.x  
