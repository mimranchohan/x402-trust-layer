# x402-trust-layer — Full Project Audit Report
**Date:** June 9, 2026  
**Scope:** Complete source scan of `src/`, `Dockerfile`, CI/CD  
**Total Source Files:** ~80 TypeScript files, ~18,800 lines

---

## 🔴 CRITICAL — فوری توجہ ضروری

---

### C-1. Private Keys `process.env` سے Runtime پر پڑھے جاتے ہیں
**File:** `src/agents/a2a-payment.ts` (lines 37–38), `src/lib/x402-client-options.ts`

```typescript
// a2a-payment.ts — ہر call پر env سے key پڑھی جاتی ہے
const evm = process.env.EVM_PRIVATE_KEY?.trim();
const sol = process.env.SOLANA_PRIVATE_KEY?.trim();
```

**مسئلہ:** Private keys کو config module میں ایک بار پڑھ کر redact کر دینا چاہیے۔ اگر کوئی error logger بعد میں `process.env` serialize کر دے، یا کوئی debug middleware چلے، تو keys leak ہو سکتی ہیں۔ اس کے علاوہ `a2a-payment.ts` میں keys کو `null` یا `undefined` چیک بھی نہیں کیا جاتا قبل از استعمال۔

**Fix:**
```typescript
// config.ts میں ایک بار پڑھو اور redact کرو
export const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY?.trim() ?? null;
// پھر process.env میں سے مٹا دو
delete process.env.EVM_PRIVATE_KEY;
delete process.env.SOLANA_PRIVATE_KEY;
```

---

### C-2. `JsonDatabase` بالکل Lossy ہے — Data Loss Silently
**File:** `src/lib/db.ts`

`JsonDatabase` (SQLite unavailable ہو تو fallback) صرف ~10 hardcoded SQL patterns handle کرتا ہے۔ کوئی بھی نئی query جو ان patterns میں نہیں آتی وہ `undefined` یا `[]` return کرتی ہے بغیر کسی error کے۔

```typescript
// Statement.run() ہمیشہ یہی return کرتا ہے، چاہے write کامیاب ہو یا نہ ہو:
run(...args: any[]): { changes: number; lastInsertRowid: number } {
    this.db.executeWrite(this.query, args);
    return { changes: 1, lastInsertRowid: 1 }; // ❌ FAKE — ہمیشہ 1
}
```

**اثرات:**
- Nonce store، idempotency cache، webhook subscriptions — سب خاموشی سے fail ہو سکتے ہیں
- Replay attacks possible اگر nonce نہ لکھا جائے
- Idempotency check bypass ہو سکتا ہے
- Migrations صرف SQLite پر چلتے ہیں — JsonDatabase پر `mandates` table کبھی نہیں بنتی

**Fix:** JsonDatabase کو production-ready بنانے کے بجائے startup پر واضح warning/error دو:
```typescript
if (!SqliteDatabaseClass) {
  if (isProduction()) {
    throw new Error("FATAL: better-sqlite3 unavailable in production. Cannot start.");
  }
  logger.warn("⚠️  Using in-memory JsonDatabase — data will NOT persist across restarts");
}
```

---

### C-3. In-Memory Rate Limiters — Restart پر Reset
**File:** `src/lib/rate-limit.ts`

چاروں rate limiters (`rateLimitPerMinute`, `rateLimitPerHour`, `rateLimitUnpaidProbes`, `rateLimitAgentLookup`) plain `Map<string, Bucket>` ہیں۔

**مسئلہ:** Process restart یا deploy کے بعد تمام buckets صاف ہو جاتے ہیں۔ Railway پر zero-downtime deploys ہوتے ہیں لیکن اگر crash ہو تو attacker پوری limit دوبارہ پا لیتا ہے۔ Multi-instance deployments (horizontal scaling) میں ہر instance کی اپنی limit ہے — effective limit `N × configured_limit` بن جاتی ہے۔

**Fix (آسان):** Redis/Upstash adapter optional بنائیں:
```typescript
// اگر UPSTASH_REDIS_REST_URL موجود ہو تو Redis-backed rate limiter استعمال کرو
// ورنہ in-memory رکھو (development کے لیے ٹھیک ہے)
```

---

## 🟠 HIGH — جلد Fix کرنا چاہیے

---

### H-1. `applyVerifierExampleBody` — Real Validation Failures Mask ہوتی ہیں
**File:** `src/lib/apply-verifier-body.ts`

یہ middleware خالی یا ادھوری body آنے پر `VERIFY_EXAMPLES` سے data merge کرتا ہے۔ اگرچہ `DANGEROUS_OVERRIDE_KEYS` blocklist ہے، لیکن:

```typescript
// کوئی بھی partial body آنے پر example data fill ہوتا ہے
// اگر user نے کوئی field غلط type سے بھیجی ہو اور example میں وہ field ہو
// تو example کی value override ہو جائے گی — user کی invalid value نہیں
```

**مسئلہ:** x402gle probing agent کا behavior legitimate requests کی validation کو کمزور بناتا ہے۔ ایک malicious agent partial body بھیج کر example values کا فائدہ اٹھا سکتا ہے۔

**Fix:** صرف `Content-Length: 0` یا missing body پر apply کرو، partial bodies پر نہیں:
```typescript
const bodyIsEmpty = !req.body || Object.keys(req.body).length === 0;
if (!bodyIsEmpty) return next(); // partial body? user کی validation چلنے دو
```

---

### H-2. `verifierFastPath` — Probe Agents کے لیے Weaker Security
**File:** `src/agents/x402-proxy.ts`

```typescript
// verifierFast path میں `allowed` logic مختلف ہے
if (verifierFastPath) {
  allowed = !blocked; // صرف explicit block چیک
} else {
  allowed = !blocked && riskResult.allowed && identityResult.allowed; // full check
}
```

**مسئلہ:** اگر کوئی attacker اپنے request کو "probe" کے طور پر identify کرائے تو identity اور risk gates bypass ہو جاتے ہیں۔ Probe detection logic کی robustness verify کرنی چاہیے۔

---

### H-3. `assertProductionSecrets()` — صرف HMAC کے لیے، باقی Keys کے لیے نہیں
**File:** `src/config.ts`

```typescript
export function assertProductionSecrets(): void {
  if (ATTESTATION_HMAC_SECRET.length < 32) {
    throw new Error("ATTESTATION_HMAC_SECRET must be at least 32 chars in production");
  }
  // ❌ EVM_PRIVATE_KEY اور SOLANA_PRIVATE_KEY کی validation نہیں
  // ❌ WEBHOOK_ADMIN_SECRET صرف warning دیتا ہے، throw نہیں کرتا
}
```

**Fix:** تمام critical secrets کو validate کرو:
```typescript
if (!process.env.EVM_PRIVATE_KEY?.trim()) {
  throw new Error("EVM_PRIVATE_KEY is required in production");
}
if (!process.env.WEBHOOK_ADMIN_SECRET?.trim() || process.env.WEBHOOK_ADMIN_SECRET.length < 24) {
  throw new Error("WEBHOOK_ADMIN_SECRET must be at least 24 chars in production");
}
```

---

### H-4. 90 `console.log/error/warn` Calls — Structured Logging نہیں
**File:** `src/` (multiple files)

Project میں `pino` logger ہے لیکن 90 جگہوں پر raw `console.*` calls ہیں۔

**مسئلہ:**
- Structured logging (JSON) کا فائدہ نہیں ملتا
- Railway/OpenTelemetry میں log correlation نہیں ہوتی
- Sensitive data accidentally log ہو سکتی ہے

**Fix:** `src/lib/logger.ts` کے `logger` کو consistently use کرو۔

---

### H-5. `SOLANA_RPC_URL` Default Public RPC — Production کے لیے نامناسب
**File:** `src/agents/solana-actions.ts` (line 6)

```typescript
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
```

**مسئلہ:** Public Solana RPC aggressively rate limit کرتا ہے۔ Production میں یہ payment failures کا سبب بن سکتا ہے۔ کوئی production validation نہیں۔

**Fix:** Production میں Helius/QuickNode/Alchemy RPC URL کو required بنائیں۔

---

## 🟡 MEDIUM — آرام سے لیکن ضرور Fix کریں

---

### M-1. ZK Proofs — Simulated، Real SNARKs نہیں
**File:** `src/lib/` (ZK-related files)

`ALLOW_ZK_SIMULATE=1` flag کے تحت ZK proofs simulate ہوتے ہیں۔ Documentation اور API responses میں یہ واضح نہیں کہ یہ "zero-knowledge" نہیں — بس ایک placeholder ہے۔

**Risk:** اگر کوئی external system/user اسے real cryptographic proof سمجھے تو security false sense ہوگی۔

**Fix:** API response میں explicit field شامل کرو:
```json
{ "zkProof": { "simulated": true, "warning": "NOT cryptographically secure" } }
```

---

### M-2. Idempotency — 2% Random Pruning — Unbounded Growth Risk
**File:** `src/lib/idempotency.ts`

```typescript
if (Math.random() < 0.02) pruneExpired(); // 2% chance on each request
```

**مسئلہ:** High-traffic situations میں pruning کبھی نہ چلے یا بہت زیادہ چلے۔ Scheduled/deterministic pruning بہتر ہے:

**Fix:**
```typescript
// ہر 1000 requests پر ایک بار prune کرو
if (++requestCounter % 1000 === 0) pruneExpired();
// یا setInterval استعمال کرو (process startup پر)
```

---

### M-3. `savingsVsSeparateUsdc: 0.11` — Hardcoded Value
**File:** `src/agents/pre-x402-guard.ts`

```typescript
savingsVsSeparateUsdc: 0.11 // ❌ hardcoded، actual pricing سے computed نہیں
```

اگر pricing تبدیل ہو تو یہ value automatically update نہیں ہوگی اور misleading ہوگی۔

---

### M-4. `createRequire` in ESM — Non-Standard Pattern
**File:** `src/lib/db.ts`

```typescript
const require = createRequire(import.meta.url);
SqliteDatabaseClass = require("better-sqlite3"); // CJS module in ESM
```

بہتر approach: `better-sqlite3` کی ESM-compatible fork یا `node:module` کے بجائے dynamic import کا نیا pattern۔

---

### M-5. `PIPELINE_TIMEOUT_MS` صرف `Number()` — Invalid Input پر `NaN`
**File:** `src/agents/pipeline-execute.ts` (line 47)

```typescript
const PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS ?? "8000");
```

اگر `PIPELINE_TIMEOUT_MS=abc` ہو تو `NaN` ملتا ہے جو timeout کو disable کر دیتا ہے۔

**Fix:**
```typescript
const raw = parseInt(process.env.PIPELINE_TIMEOUT_MS ?? "8000", 10);
const PIPELINE_TIMEOUT_MS = isNaN(raw) || raw < 1000 ? 8000 : raw;
```

---

### M-6. 2 Empty `catch {}` Blocks
**File:** `src/agents/alchemy-policy.ts` (lines 265, 275)

```typescript
} catch {} // ❌ error silently swallowed
} catch {} // ❌ error silently swallowed
```

یہ debugging کو بہت مشکل بنا دیتے ہیں۔ کم از کم log کرو:
```typescript
} catch (err) {
  logger.debug({ err }, "alchemy-policy: non-critical error, continuing");
}
```

---

### M-7. `index.ts` میں Same Rate Limit Applied تین بار مختلف Values کے ساتھ
**File:** `src/index.ts` (lines 413, 420, 433)

```typescript
rateLimitAgentLookup(Number(process.env.RATE_LIMIT_AGENT_LOOKUP_PER_HOUR ?? 30)),  // route 1
rateLimitAgentLookup(Number(process.env.RATE_LIMIT_AGENT_LOOKUP_PER_HOUR ?? 60)),  // route 2
rateLimitAgentLookup(Number(process.env.RATE_LIMIT_AGENT_LOOKUP_PER_HOUR ?? 60)),  // route 3
```

پہلے route کا default `30` ہے، باقی دو کا `60` — inconsistency ہے۔ ایک constant بنائیں۔

---

## 🔵 CODE QUALITY — Code صاف کرنا

---

### Q-1. 46 `any` Types — TypeScript کا فائدہ ضائع
**Files:** Multiple (grep سے 46 instances ملے)

```typescript
// مثال: src/lib/db.ts
run(...args: any[]): { changes: number; lastInsertRowid: number }
SqliteDatabaseClass: any = null;
```

**Fix:** `unknown` استعمال کرو اور type guards لگاؤ۔ ESLint rule `@typescript-eslint/no-explicit-any` enable کرو।

---

### Q-2. صرف 6 Test Files — Coverage بہت کم
پورے project میں صرف 6 `.test.ts` files ہیں:
- `alchemy-policy.test.ts`
- `payload-sandbox.test.ts`
- `semantic-judge.test.ts`
- `ssrf.test.ts`
- `webhooks.test.ts`
- `replay-guard.test.ts`

**Missing Tests:**
- `db.ts` — JsonDatabase fallback کا کوئی test نہیں
- `rate-limit.ts` — کوئی test نہیں
- `apply-verifier-body.ts` — کوئی test نہیں
- `pre-x402-guard.ts` — کوئی test نہیں
- `spend-governor.ts` — کوئی test نہیں
- `identity-gate.ts` — کوئی test نہیں

---

### Q-3. `ensureDataDirWritable()` — Import Time پر Side Effect
**File:** `src/lib/db.ts` (line ~22)

```typescript
// یہ file import ہوتے ہی run ہوتا ہے — test environments میں بھی
ensureDataDirWritable();
```

**Fix:** اسے explicit initialization function میں move کرو جو `src/index.ts` میں call ہو۔

---

### Q-4. `module-level` `let` Variables جو Mutate ہوتے ہیں
**File:** `src/lib/db.ts`

```typescript
let SqliteDatabaseClass: any = null; // module level
let db: Database | JsonDatabase | null = null; // module level
```

یہ singleton pattern ٹھیک ہے لیکن tests میں state pollution کر سکتا ہے۔

---

## ⚡ PERFORMANCE

---

### P-1. ERC-8004 Trust Score — On-Chain Calls بغیر Circuit Breaker
**File:** `src/lib/erc8004/trust-score.ts`

ہر guard request میں potentially multiple on-chain RPC calls ہوتے ہیں۔ Cache ہے لیکن:
- RPC timeout پر request hang ہو سکتا ہے
- No circuit breaker — اگر Base RPC down ہو تو تمام guard requests slow ہو جائیں

**Fix:**
```typescript
const trustScore = await Promise.race([
  computeTrustScore(agentId),
  sleep(2000).then(() => { return { tier: "UNKNOWN", score: 0 }; }) // timeout fallback
]);
```

---

### P-2. `Promise.all` میں سب Gates — اچھا ہے، لیکن Timeout نہیں
**File:** `src/agents/pre-x402-guard.ts`

```typescript
const [spendResult, riskResult, identityResult] = await Promise.all([
  runSpendGovernor(...),
  runRiskGate(...),
  runIdentityGate(...),
]);
```

یہ parallel execution اچھا ہے۔ لیکن کوئی overall timeout نہیں — اگر کوئی ایک gate hang ہو تو پورا request hang ہو جائے۔

**Fix:** `Promise.race` with timeout wrapper شامل کرو۔

---

### P-3. Webhook Dispatch — Sequential نہیں Parallel
**File:** `src/lib/webhooks.ts`

اگر multiple webhooks subscribed ہوں تو کیا وہ sequentially dispatch ہوتے ہیں؟ Parallel `Promise.allSettled` زیادہ efficient ہوگا۔

---

## 🚀 DEPLOYMENT & INFRASTRUCTURE

---

### D-1. Dockerfile — Secret ENV Variables Image میں Bake نہ کریں
**File:** `Dockerfile`

Multi-stage build اچھا ہے، non-root user (`app`) اچھا ہے۔ لیکن ensure کریں کہ:
- `EVM_PRIVATE_KEY`، `SOLANA_PRIVATE_KEY` کبھی `docker build` args میں نہ جائیں
- Railway environment secrets صرف runtime پر inject ہوں (وہ ہوتے ہیں by default)

---

### D-2. CI میں Live Production Probe
**File:** `.github/workflows/ci.yml`

```yaml
probe-production:
  # live https://x402trustlayer.xyz کو probe کرتا ہے
```

**مسئلہ:** یہ production environment کو CI سے directly hit کرتا ہے۔ اگر CI job بہت زیادہ چلے یا burst ہو تو rate limits trigger ہو سکتے ہیں۔ Staging environment کا استعمال بہتر ہے۔

---

### D-3. Health Check — External HTTP Probe نہیں، Process-Level Only
**File:** `Dockerfile`

```dockerfile
HEALTHCHECK CMD node -e "require('http').get('http://localhost:3402/health', ...)"
```

یہ process-level check ہے۔ اگر Express listen ہو لیکن SQLite corrupt ہو تو healthcheck pass کرے گا۔ `/health` endpoint میں DB connectivity check شامل کرو۔

---

## 📋 PRIORITY FIX ORDER (خلاصہ)

| Priority | Issue | File | Impact |
|----------|-------|------|--------|
| 🔴 C-1 | Private keys runtime read | `a2a-payment.ts` | Key leak risk |
| 🔴 C-2 | JsonDatabase silently lossy | `db.ts` | Data integrity |
| 🔴 C-3 | In-memory rate limiters | `rate-limit.ts` | Rate limit bypass |
| 🟠 H-3 | assertProductionSecrets incomplete | `config.ts` | Missing validation |
| 🟠 H-4 | 90 raw console.* calls | Multiple | Log leak risk |
| 🟠 H-5 | Public Solana RPC default | `solana-actions.ts` | Payment failures |
| 🟡 M-2 | Random idempotency pruning | `idempotency.ts` | DB growth |
| 🟡 M-5 | NaN on invalid timeout | `pipeline-execute.ts` | Silent disable |
| 🟡 M-6 | Empty catch blocks | `alchemy-policy.ts` | Debug blindspot |
| 🔵 Q-1 | 46 `any` types | Multiple | Type safety |
| 🔵 Q-2 | 6 test files only | Multiple | No coverage |

---

## ✅ جو اچھا ہے (Strengths)

1. **SSRF Protection** — `assertSafeOutboundUrl` + DNS rebinding check بہت solid ہے
2. **Zod Validation** — تمام route inputs پر schema validation
3. **Helmet + CORS** — standard security headers سب جگہ
4. **Replay Attack Prevention** — nonce-store SQLite + Redis آپشن
5. **Response Guard** — `ERR_HTTP_HEADERS_SENT` prevention
6. **Multi-stage Docker** — non-root user، minimal image
7. **Parallel Guard Execution** — `Promise.all` pattern efficient ہے
8. **Idempotency Cache** — 24h TTL، SHA-256 body hash collision detection
9. **Migrations System** — versioned migrations اچھا pattern ہے
10. **Facilitator Allowlist** — صرف known origins allow

---

*Generated by full source scan — June 9, 2026*
