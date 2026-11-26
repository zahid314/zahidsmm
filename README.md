# ZAHIDSMM — SMM Panel (Render Free + Neon Postgres)

> ZAHIDSMM — SMM Panel (Render Free + Neon Postgres)
>
> Ye ZAHIDSMM panel ka deploy karne wala version hai. Dil SMM Panel jaisa panel: services, orders, wallet (JazzCash), support bot, Admin — sab kuch. Free hosting par chalega, koi paisa nahi lagega.

## Kya hai is mein? / Features

- **Login/Signup pehle screen** — ZAHIDSMM logo, bina login ke Dashboard nahi dikhta.
- **Pehla Signup = Owner/Admin**, baad wale accounts customers hain.
- **Login username YA Gmail se**, Signup mein Gmail zaroori hai.
- **Forgot Password — owner-mediated:** user request bhejta hai, Admin panel mein "Password Reset Requests" mein dekhta hai aur naya password set karta hai.
- **"Continue with Gmail"** button Gmail/name fill karta hai — login ke liye panel password phir bhi zaroori hai (asli one-tap Google login ke liye Google OAuth chahiye, wo is version mein nahi hai).
- **Services** — Dil API (`https://dilsmmpanel.com/api/v2`) se live sync hoti hain (Admin > Services > Sync). Agar `DIL_API_KEY` set nahi hai to list khali rahegi.
- **New Order** — order Dil provider ko jata hai, balance se charge kat-ta hai.
- **Pricing** — Dil USD rate + **25% margin**, phir USD→PKR **1 USD = Rs 276.43**. Currencies: **PKR (default), USD, INR (1 USD = ₹92.15), SAR (1 USD = SR 3.75)** — switchable, rates Admin Settings mein change ho sakti hain.
- **Wallet — JazzCash MWALLET debit (real):** amount + apna JazzCash mobile likhein, PIN option SIM / JazzCash app par aayegi, MPIN likh ke Confirm karein — JazzCash wallet se paise kat kar owner ke merchant account mein jayenge, phir Status Inquiry ke baad balance khud add ho jayega. Merchant credentials (Merchant ID / Password / Integrity Salt) Admin > Settings mein daalein — poori guide: **[README-JAZZCASH.md](README-JAZZCASH.md)**. Agar merchant credentials nahi dale to Wallet **DEMO** mode mein rehta hai (demo PIN, asli paise nahi).
- **Admin manual balance add:** Admin → Registered Users mein kisi user ke saamne Rs amount likh ke **Balance Add Karein** — agar customer ne JazzCash app se seedha paise bheje hon to owner aise balance add kar sakta hai.
- **Support tickets + Auto Bot:** naya ticket aate hi bot foran jawab deta hai — pehli line: **"Aapka issue owner ke samne kar diya gaya hai."** phir topic ke mutabiq madad. Admin jawab de to bot band ho jata hai (takeover). Bot Admin Settings mein ON/OFF ho sakta hai.
- **Admin (sirf Owner):** Overview (users, orders, revenue, profit, Dil balance), Registered Users, Password Reset Requests, Payments, Dil API Settings, JazzCash Settings, WhatsApp Channel Link.
- **WhatsApp Channel:** https://whatsapp.com/channel/0029VbEUyRXLY6dBG6K9jo0F — har page par upar button, Admin Settings mein link change ho sakta hai.
- **Database:** Neon Postgres (`DATABASE_URL` env var). Tables khud ban jati hain: users, orders, payments, tickets, ticket_messages, reset_requests, services_cache, settings.

## Deploy kaise karein? / Step-by-step (Roman Urdu)

### Step 0 — Pehle se tayyar (aap kar chuke hain)
- GitHub account: **zahidsmm**
- Render account: ban gaya
- Neon project: **zahidsmm**, branch **production**, Expires: Never

### Step 1 — Code GitHub par dalo
1. GitHub par jao, **New repository** banao, naam `zahidsmm` rakho, **Public** rakho.
2. Is folder (`zahidsmm-deploy`) ki saari files us repo mein upload karo — GitHub web se "uploading an existing file" se bhi ho jata hai, ya git se:
   ```bash
   git init
   git add .
   git commit -m "ZAHIDSMM panel"
   git branch -M main
   git remote add origin https://github.com/zahidsmm/zahidsmm.git
   git push -u origin main
   ```
   ⚠️ `.env` file kabhi upload mat karo — sirf `.env.example` upload karo.

### Step 2 — Render par Web Service banao
1. [Render](https://render.com) Dashboard kholo → **New + → Web Service**.
2. **Build and deploy from a Git repository** choose karo, apna `zahidsmm/zahidsmm` repo connect karo.
3. Settings:
   - **Name:** `zahidsmm`
   - **Region:** Frankfurt (ya Singapore — Pakistan ke qareeb)
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** **Free**
4. **Environment Variables** mein ye 3 zaroor dalo:
   | Key | Value (kahan se?) |
   |---|---|
   | `DATABASE_URL` | Neon Dashboard → Project `zahidsmm` → **Connect** → connection string copy karo (password wala — chat mein mat bhejo) |
   | `DIL_API_KEY` | Dil SMM Panel account → API page se key copy karo |
   | `JWT_SECRET` | Koi lamba random secret likho, jaise `zahid-smm-secret-2026-xyz-123` |
   | `DIL_API_URL` | `https://dilsmmpanel.com/api/v2` |
5. **Create Web Service** par click karo — deploy 2–5 minute mein ho jayega. Link milega jaise `https://zahidsmm.onrender.com`

> Tip: `render.yaml` is repo mein hai — Render Blueprint se bhi deploy ho sakta hai, lekin upar wala manual tareeqa asaan hai. `DATABASE_URL` aur `DIL_API_KEY` Render mein khud dalne hain, `render.yaml` mein ye nahi hain (security ke liye).

### Step 3 — Pehla Signup = Admin
1. Apna Render link kholo — Login/Signup screen dikhegi.
2. **Signup** karo (apna naam, username, Gmail, password). **Pehla account hi Owner/Admin banta hai.**
3. Login karo — **Admin** tab dikhega, to aap Admin hain. ✅
4. Admin → Services → **Dil se Sync Karein** — 557 services aa jayengi (Dil balance hona chahiye).

### Step 4 — Neeche wali cheezein check karo
- Admin → Settings: margin 25%, rates, WhatsApp link, Support Bot ON.
- Wallet mein test ke liye JazzCash PIN flow se funds add karo (demo PIN screen par dikhega).
- Ek chhota test order lagao.

## Free hosting ki limits (sach bata raha hoon)
- **Render Free:** har mahine 750 hours free — ek service poora mahina chalegi, har mahine renew hoti hai. **15 minute koi na khole to server so jata hai**, pehla khulne mein ~1 minute lagta hai. Aap khud kholte raho ge to din mein nahi soyega; raat ko so jayega, subah pehle khulne mein 1 minute lagega. Free pinger (UptimeRobot, free) har 5 minute ping karke jagaye rakh sakta hai.
- **Neon Free:** is project ki expiry **Never** hai (screenshot mein dikha) — customers ka data 30 din mein khatam nahi hoga. Render ka apna free database 30 din mein expire hota hai, is liye hum wo use nahi kar rahe — Neon use kar rahe hain.
- **Google search mein aana:** jab panel public link par live hoga to Google use dhoond sakta hai — domain (jaise zahidsmm.com) lene se behtar hoga, wo paid hota hai, baad mein le sakte hain.

## Local run (test ke liye)
```bash
npm install
cp .env.example .env   # .env mein apni asli values likho
npm start              # http://localhost:10000
```

## Security notes
- Passwords `bcrypt` se hash hote hain, plain mein kabhi save nahi hote.
- Admin check server-side hota hai (JWT mein `is_admin`), sirf frontend chhupana kaafi nahi.
- API keys / passwords / connection strings kabhi code mein hardcode nahi hain — sirf env vars se aate hain.
- JazzCash: asli MWALLET debit flow hai (README-JAZZCASH.md dekhein). Merchant credentials nahi hon to Wallet **demo** mode mein rehta hai. Customer ka MPIN sirf us aik JazzCash call mein use hota hai — save ya log nahi hota. Merchant Password / Salt kabhi frontend ko poore nahi bheje jate, sirf "set hai / nahi hai" dikhta hai.
- Forgot Password **owner-mediated** hai (email service nahi hai); asli emailed reset code ke liye email service (jaise Resend/SendGrid) aur Google OAuth chahiye.
