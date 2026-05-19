# مکمل گائیڈ — x402 Agents بنانا اور Marketplace میں لسٹ ہونا

یہ دستاویز **قدم بہ قدم** ہے۔ انگریزی technical README کے لیے `README.md` دیکھیں۔

---

## حصہ ۱: یہ پروجیکٹ کیا ہے؟

آپ **فروخت کنندہ (seller)** ہیں۔ ہر API call پر agent آپ کو **USDC** دیتا ہے۔

پانچ services:

1. **Spend Governor** — پیسے خرچ ہونے سے پہلے روکتا ہے  
2. **Receipt Auditor** — payment کے بعد چیک  
3. **Risk Gate** — خطرناک URL روکتا ہے  
4. **API Router** — سستا/بہترین x402 API ڈھونڈتا ہے  
5. **Research Brief** — موضوع پر research pipeline  

---

## حصہ ۲: لوکل چلانا

```powershell
cd C:\Users\mimra\x402-agent-suite
copy .env.example .env
notepad .env
```

`.env` میں:

```
PAY_TO_ADDRESS=0xآپکاوالٹ
NETWORK=base
PORT=3402
```

پھر:

```powershell
npm install
npm run dev
```

براؤزر: `http://localhost:3402` — endpoints کی فہرست ملے گی۔

---

## حصہ ۳: Marketplace میں لسٹ — اصل طریقہ

### غلط فہمی

❌ "Dexter par form bhar ke submit karna" — **ایسا نہیں**

### صحیح طریقہ

✅ Endpoint **402 + settlement** کرے → system **خود** catalog میں ڈالے

### آپ کو کیا کرنا ہے (چیک لسٹ)

- [ ] Server **internet par public** (localhost کافی نہیں)  
- [ ] `@dexterai/x402` middleware لگا ہو (یہ repo میں ہے)  
- [ ] `PAY_TO_ADDRESS` وہی ہو جو sellers page par claim کرو گے  
- [ ] کم از کم **1–5 اصلی paid calls** (خود یا دوست سے)  
- [ ] **15 منٹ** انتظار — AI verifier  
- [ ] [dexter.cash/sellers](https://dexter.cash/sellers) par profile مکمل  

### Score 75+ کیسے؟

| کریں | نہ کریں |
|------|---------|
| واضح JSON جو سوال کا جواب دے | "OK" یا خالی response |
| تیز server (< 3s) | بار بار 500 error |
| قیمت $0.25 سے کم | بہت مہنگا بغیر value |
| openapi.json | بہت بڑا 50KB+ body |

---

## حصہ ۴: پہلی کمائی کا عملی راستہ

### ہفتہ 1 — Deploy

1. Railway/Render account  
2. GitHub repo push  
3. Env: `PAY_TO_ADDRESS`, `PUBLIC_BASE_URL`  
4. `npm run build` + start command  

### ہفتہ 2 — Discovery

1. خود `npm run demo` (EVM wallet + $5 USDC Base par)  
2. OpenDexter سے اپنی API search کرو  
3. Twitter/Discord par: "x402 spend governor API — $0.03/call"  

### ہفتہ 3 — B2B

Teams کو message:

> "Aap ke agents unlimited x402 pay kar sakte hain — hamara Spend Governor roz ka cap lagata hai."

Package: **$99/mo** + per-call fees

---

## حصہ ۵: Agents کو آپس میں جوڑنا

```
User: "ETH price check karo, max $1 aaj"

1. Spend Governor → allowed?
2. Risk Gate → URL safe?
3. Router → best oracle
4. x402_fetch → oracle URL
5. Receipt Auditor → payment sahi?
6. User ko jawab
```

Cursor میں: OpenDexter plugin enable → har step `x402_fetch`.

---

## حصہ ۶: اکثر سوالات

**Q: Kya Urdu/Hindi marketplace description likh sakte hain?**  
A: Haan, lekin API **response English/JSON** mein specific ho — verifier English samajhta hai.

**Q: Solana ya Base?**  
A: Dono chalte hain. Base par zyada x402 volume abhi.

**Q: Bina deploy ke test?**  
A: Local `npm run dev` + `npm run demo` — listing ke liye deploy zaroori.

**Q: Data folder kya hai?**  
A: Spend Governor daily spend ledger — production mein database use karo.

---

## حصہ ۷: اگلا upgrade (optional)

- PostgreSQL ledger  
- Team API keys (SIWX)  
- Webhook on settlement  
- Dexter **MPP sessions** — 100 calls = 1 on-chain tx  

Docs: [MPP on Solana](https://docs.dexter.cash/docs/mpp/)

---

**Project path:** `C:\Users\mimra\x402-agent-suite`

کسی step par atak jao to deploy platform + error message bhejo۔
