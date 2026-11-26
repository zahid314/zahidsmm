# JazzCash Merchant — ZAHIDSMM mein asli payment (Real Earnings)

> English summary is at the bottom. **Koi bhi asli credential is file mein nahi hai** — aur kabhi code / chat mein mat daalein.

## Ye kya hai? (Roman Urdu)

Pehle Wallet mein PIN flow **demo** tha — balance screen par add ho jata tha, lekin owner ke JazzCash mein asli paise nahi aate the. Ab **asli JazzCash MWALLET debit flow** add ho gaya hai:

1. **Customer** Wallet mein **Amount** aur **apna JazzCash mobile number** likhta hai, phir **PIN Bhejein** dabata hai.
2. **PIN option us ke SIM / JazzCash app par jati hai** — wo apna **MPIN** likhta hai aur **Confirm** dabata hai.
3. Server **amount + mobile + MPIN** JazzCash ko bhejta hai — **MWALLET debit** (`DoMWalletTransaction`, `pp_MerchantMPIN`).
4. JazzCash customer ke JazzCash wallet se paise kaat kar **owner ke merchant account mein bhej deta hai**.
5. Server phir **Status Inquiry** se JazzCash se confirm karta hai — **sirf jab JazzCash kahe payment kamyab hui (`pp_ResponseCode '000'`), tab hi panel balance auto-add hota hai.** Agar payment fail ho to balance add nahi hota.

**Card / redirect checkout is flow mein use nahi hota** — sirf MWALLET debit hi main flow hai.

### MPIN ki hifazat (zaroor parhein)

- Customer ka MPIN **sirf us aik JazzCash call mein** use hota hai jo payment karti hai.
- MPIN **database mein save nahi hota, log mein nahi likha jata, aur frontend ko wapas nahi bheja jata.** Confirm dabane ke baad frontend bhi PIN box khali kar deta hai.
- Merchant **Password / Integrity Salt bhi kabhi log nahi hote aur frontend ko kabhi poore nahi bheje jate** — Admin ko sirf "set hai / nahi hai" dikhta hai.

### Demo mode kab chalta hai?

Agar JazzCash Merchant ID / Password / Salt **nahi** dale gaye, to Wallet **DEMO** mode mein rehta hai — screen par saaf likha hota hai "JazzCash DEMO mode hai", aur demo PIN screen par dikhaya jata hai. Demo se asli paise nahi aate. Jaise hi teeno credentials daal diye jayein, Wallet khud **LIVE** ho jata hai.

## Owner ko kya daalna hai? (Admin > Settings)

Panel mein login karein (pehla Signup = Owner/Admin) → **Admin** tab → **Settings** → **"JazzCash Merchant"** section:

| Field | Kya daalein | Kahan se milega? |
|---|---|---|
| Merchant ID | JazzCash Merchant ID | JazzCash merchant portal / JazzCash Business app → API / Merchant Details |
| Merchant Password | Merchant Password (API password, portal login nahi) | JazzCash merchant portal se — JazzCash onboarding email / portal mein milta hai |
| Integrity Salt | Integrity Salt / Hash Key | JazzCash merchant portal → API credentials section |
| Environment | **Sandbox** (pehle test) ya **Production** (asli paise) | Pehle Sandbox par test karein, phir Production par jayein |

**Ye details chat mein kabhi mat bhejein** — sirf Admin > Settings mein khud daalein. Khali field ka matlab hai purani saved value waisi hi rahegi (badalni ho to naya likhein).

Agar aap env vars use karna chahein (Admin Settings ki jagah), to Koyeb > Environment variables mein daalein: `JAZZCASH_MERCHANT_ID`, `JAZZCASH_PASSWORD`, `JAZZCASH_SALT`, `JAZZCASH_ENV` (`sandbox` ya `production`). Env vars hon to wo Admin Settings se pehle use hote hain.

### Sandbox se shuru karein

1. JazzCash sandbox par signup karein: https://sandbox.jazzcash.com.pk/ — wahan se **sandbox** Merchant ID / Password / Salt milenge.
2. Admin > Settings mein wo daalein, Environment **Sandbox** rakhein, Save karein.
3. Ek chhoti test payment karein (sandbox test number / MPIN JazzCash sandbox guide mein hota hai).
4. Sab theek ho to **live** Merchant ID / Password / Salt daalein aur Environment **Production** kar dein.

## Manual balance add (fallback — agar auto payment na ho)

Kabhi customer JazzCash app se seedha owner ke JazzCash number par paise bhej de (panel ke bahar), to:

1. Admin → **Registered Users** mein us user ke saamne **Rs amount** likhein.
2. **Balance Add Karein** dabayein, note mein JazzCash TID / screenshot reference likhein.
3. Balance turant add ho jayega, aur payment `Manual-JazzCash` ke naam se record ho jayegi.

## Customer flow — Live vs Demo

| Step | Live (merchant connected) | Demo (merchant nahi hai) |
|---|---|---|
| 1. Wallet → Amount + JazzCash mobile | Same | Same |
| 2. PIN Bhejein | Pending payment banti hai, PIN option SIM / JazzCash app par jati hai | Demo PIN screen par dikhta hai |
| 3. MPIN / PIN likh ke Confirm | MPIN JazzCash ko jata hai, paise merchant account mein aate hain, Status Inquiry ke baad balance auto-add | Demo PIN match hote hi balance add (asli paise nahi) |
| 4. Fail ho to? | Balance add nahi hota, JazzCash ki wajah dikhayi jati hai | — |

## Technical notes (developers)

- **Endpoints:** Sandbox `https://sandbox.jazzcash.com.pk/ApplicationAPI/API`, Production `https://payments.jazzcash.com.pk/ApplicationAPI/API`.
  - Debit: `POST /2.0/Purchase/DoMWalletTransaction` — fields: `pp_Language=EN`, `pp_MerchantID`, `pp_SubMerchantID`, `pp_Password`, `pp_TxnRefNo` (unique, `T` + timestamp), `pp_MobileNumber`, `pp_MerchantMPIN`, `pp_CNIC` (optional, last 6 digits), `pp_Amount` (paisas = Rs × 100, no decimal), `pp_TxnCurrency=PKR`, `pp_TxnDateTime` (`yyyyMMddHHmmss`), `pp_BillReference`, `pp_Description`, `pp_TxnType=MPAY`, `pp_TxnExpiryDateTime`, `pp_Version=1.1`, `ppmpf_1..5`.
  - Status Inquiry: `POST /2.0/Purchase/StatusInquiry` — `pp_MerchantID`, `pp_Password`, `pp_TxnRefNo`, `pp_TxnDateTime`, `pp_SecureHash`. **Note:** JazzCash onboarding version ke mutabiq inquiry path alag ho sakta hai — agar inquiry 404 de to `JAZZCASH_INQUIRY_URL` (env) se override karein ya JazzCash portal mein apna endpoint confirm karein. Wallet URL bhi `JAZZCASH_WALLET_URL` se override ho sakta hai.
- **Secure hash:** HMAC-SHA256 — saare non-empty `pp_*` fields ko lower-cased naam se alphabetically sort karein, values ko `&` se jodein, aage Integrity Salt lagayein (`salt + '&' + values...`), HMAC key = Salt, hex **UPPERCASE**.
- **Success:** `pp_ResponseCode === '000'` (ya inquiry mein `pp_Status === 'Complete'`). Balance credit atomic hai — `UPDATE payments SET status='completed' WHERE id=$1 AND status='pending'` — dobara credit nahi hota.
- **Server endpoints (is panel ke):**
  - `POST /api/wallet/add-request` — amount + mobile (+ optional CNIC) → pending payment, mode `live` ya `demo`.
  - `POST /api/wallet/add-confirm` — payment_id + MPIN/PIN → live mein JazzCash debit + Status Inquiry, phir credit; demo mein PIN match.
  - `GET /api/admin/jazzcash-status` — Admin only, sirf flags: `connected`, `env`, `*_set`.
  - `GET /api/settings-public` — `jazzcash_connected`, `jazzcash_env` (Wallet LIVE/DEMO badge ke liye).
  - `GET /api/health` — ab `jazzcashConfigured` bhi deta hai.
  - `POST /api/admin/users/:id/add-balance` — Admin only, `{amount, note}` → manual credit, `Manual-JazzCash` payment row.
  - `GET /api/admin/settings` — JazzCash secrets kabhi return nahi karta, sirf `*_set` flags.
- **DB:** `payments` table mein naye columns: `txn_ref_no`, `jazzcash_response_code`, `jazzcash_response_message`, `note`, `cnic_last6` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` se purane DB par bhi safe).

## Sources (research, 2026-11-25)

- JazzCash Payment Gateway API Reference (v4.2, REST APIs): https://jazzcash.alihamas.pk/docs/api-reference — environments, MWALLET rails, hash scheme, `pp_ResponseCode`.
- MWALLET v2 CNIC: https://jazzcash.alihamas.pk/docs/api-reference/mobile-wallet/mobileWalletPayV2CNIC — `POST /2.0/Purchase/DoMWalletTransaction/CNIC`, fields, amount in paisas, `yyyyMMddHHmmss`.
- MWALLET v1 Default: https://jazzcash.alihamas.pk/docs/api-reference/mobile-wallet/mobileWalletV1 — `POST /2.0/Purchase/DoMWalletTransaction`, `pp_MerchantID`, `pp_Password`, `pp_TxnRefNo`, `pp_MobileNumber`, `pp_CNIC`, `pp_Amount`, `pp_SecureHash`, `pp_TxnType MPAY`, `pp_Version 1.1`.
- JazzCash developer portal / sandbox: https://developer.jazzcash.com.pk/ and https://sandbox.jazzcash.com.pk/ — sandbox signup, test credentials.
- Pakistan payment gateways guide (hash + MWALLET + env vars): https://github.com/absar091/quizzicallabsai/blob/HEAD/PAKISTAN_PAYMENT_GATEWAYS_GUIDE.md
- JazzCash MCP / REST reference (endpoints + overrides + hash): https://glama.ai/mcp/servers/TehreemArbab/JazzCashMCP
- Mobile Wallet Refund API guide (hash scheme + `pp_MerchantMPIN` field): https://www.scribd.com/document/941012260/Refund-Guide-Template-for-Merchant-Mobile-Wallet

> ⚠️ JazzCash apne docs / endpoint paths waqtan-fa-waqtan update karta hai. Live jaane se pehle **Sandbox par test zaroor karein**, aur agar koi endpoint 404 de to apne JazzCash merchant portal mein us version ka endpoint confirm karein.

---

## English summary

ZAHIDSMM now has a real JazzCash MWALLET debit flow. The customer enters amount + their JazzCash mobile number, receives a PIN prompt on their SIM / JazzCash app, enters their MPIN, and the server debits their wallet via `DoMWalletTransaction` (settling into the owner's merchant account), then verifies via Status Inquiry before crediting the panel balance. The MPIN is used only transiently in that one JazzCash call — never stored or logged. If no merchant credentials are set, the wallet stays in clearly-labelled demo mode. Admin can also credit a user manually (Admin → Registered Users → Balance Add) after receiving a real JazzCash payment outside the panel. Merchant credentials go in Admin → Settings → JazzCash Merchant (or `JAZZCASH_*` env vars) — never in chat. Test on Sandbox first, then switch Environment to Production.
