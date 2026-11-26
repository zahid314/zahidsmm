// ZAHIDSMM — SMM panel backend
// Stack: Node.js + Express + Neon Postgres (DATABASE_URL)
// Provider: Dil SMM Panel API v2 (DIL_API_KEY env var — never hardcode it)
// Run:  node server.js   (PORT env or 10000, Render sets PORT)
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-render-env-vars';
const DIL_API_URL = process.env.DIL_API_URL || 'https://dilsmmpanel.com/api/v2';
const DIL_API_KEY = process.env.DIL_API_KEY || '';

if (!process.env.DATABASE_URL) console.warn('WARNING: DATABASE_URL not set — set it in Render > Environment (Neon connection string).');
if (!DIL_API_KEY) console.warn('WARNING: DIL_API_KEY not set — services will be empty until you set it in Render > Environment.');
if (JWT_SECRET === 'change-me-in-render-env-vars') console.warn('WARNING: set a strong JWT_SECRET in Render > Environment.');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

// ---------- DB ----------
async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      balance_pkr NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      service_id INTEGER NOT NULL,
      service_name TEXT,
      link TEXT,
      quantity INTEGER NOT NULL,
      charge_pkr NUMERIC NOT NULL DEFAULT 0,
      cost_pkr NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      provider_order_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      amount_pkr NUMERIC NOT NULL,
      method TEXT NOT NULL DEFAULT 'JazzCash',
      mobile TEXT,
      pin_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      bot_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS reset_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS services_cache (
      service_id INTEGER PRIMARY KEY,
      name TEXT, category TEXT,
      rate_usd NUMERIC NOT NULL DEFAULT 0,
      price_override_pkr NUMERIC,
      min_qty INTEGER NOT NULL DEFAULT 1,
      max_qty INTEGER NOT NULL DEFAULT 10000,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const defaults = {
    margin_pct: '25',
    usd_pkr: '276.43',
    usd_inr: '92.15',
    usd_sar: '3.75',
    whatsapp_link: 'https://whatsapp.com/channel/0029VbEUyRXLY6dBG6K9jo0F',
    support_bot_enabled: 'true',
    dil_api_url: DIL_API_URL,
  };
  for (const [k, v] of Object.entries(defaults)) {
    await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [k, v]);
  }
}

async function getSettings() {
  if (!pool) return { margin_pct: '25', usd_pkr: '276.43', usd_inr: '92.15', usd_sar: '3.75', whatsapp_link: 'https://whatsapp.com/channel/0029VbEUyRXLY6dBG6K9jo0F', support_bot_enabled: 'true', dil_api_url: DIL_API_URL };
  const r = await pool.query('SELECT key,value FROM settings');
  const s = {};
  r.rows.forEach(x => s[x.key] = x.value);
  return s;
}
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

// ---------- Auth ----------
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Session expired — login again' }); }
}
async function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}
function sign(user) {
  return jwt.sign({ id: user.id, username: user.username, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: '30d' });
}

// ---------- Dil API ----------
async function dilCall(params) {
  if (!DIL_API_KEY) throw new Error('DIL_API_KEY not set');
  const body = new URLSearchParams({ key: DIL_API_KEY, ...params });
  const r = await fetch(DIL_API_URL, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return r.json();
}
async function syncServices() {
  const data = await dilCall({ action: 'services' });
  if (!Array.isArray(data)) throw new Error('Dil API did not return services: ' + JSON.stringify(data).slice(0, 200));
  for (const s of data) {
    await pool.query(
      `INSERT INTO services_cache(service_id,name,category,rate_usd,min_qty,max_qty,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT(service_id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category,
       rate_usd=EXCLUDED.rate_usd, min_qty=EXCLUDED.min_qty, max_qty=EXCLUDED.max_qty, updated_at=now()`,
      [s.service, s.name, s.category || '', num(s.rate, 0), num(s.min, 1), num(s.max, 10000)]);
  }
  return data.length;
}

// ---------- Public / auth routes ----------
app.get('/api/health', (req, res) => res.json({ ok: true, panel: 'ZAHIDSMM', dilConfigured: !!DIL_API_KEY, dbConfigured: !!pool }));

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, username, email, password } = req.body || {};
    if (!name || !username || !email || !password) return res.status(400).json({ error: 'Name, username, Gmail aur password sab zaroori hain' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Sahi Gmail likhein' });
    if (password.length < 6) return res.status(400).json({ error: 'Password kam az kam 6 harf ka ho' });
    const count = await pool.query('SELECT COUNT(*)::int AS c FROM users');
    const isFirst = count.rows[0].c === 0; // first signup = Owner/Admin
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users(name,username,email,password_hash,is_admin) VALUES($1,$2,$3,$4,$5) RETURNING id,name,username,email,is_admin,balance_pkr',
      [name.trim(), username.trim().toLowerCase(), email.trim().toLowerCase(), hash, isFirst]);
    const u = r.rows[0];
    res.json({ token: sign(u), user: u, isAdmin: isFirst, message: isFirst ? 'Aap pehle account hain — aap Owner/Admin ban gaye!' : 'Signup ho gaya!' });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ye username ya Gmail pehle se use ho raha hai' });
    console.error(e); res.status(500).json({ error: 'Signup failed: ' + e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body || {}; // login = username OR Gmail
    if (!login || !password) return res.status(400).json({ error: 'Username/Gmail aur password likhein' });
    const r = await pool.query('SELECT * FROM users WHERE username=$1 OR email=$1', [login.trim().toLowerCase()]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'Galat login ya password' });
    res.json({ token: sign(u), user: { id: u.id, name: u.name, username: u.username, email: u.email, is_admin: u.is_admin, balance_pkr: u.balance_pkr } });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Forgot password — owner-mediated (no email service): user requests, Admin resets in panel
app.post('/api/auth/forgot', async (req, res) => {
  try {
    const { login } = req.body || {};
    const r = await pool.query('SELECT id FROM users WHERE username=$1 OR email=$1', [(login || '').trim().toLowerCase()]);
    if (!r.rows[0]) return res.json({ ok: true, message: 'Agar account hai to request Admin ko mil gayi hai.' });
    await pool.query("INSERT INTO reset_requests(user_id,status) VALUES($1,'pending')", [r.rows[0].id]);
    res.json({ ok: true, message: 'Reset request Admin ko bhej di gayi hai. Admin naya password set karke aap ko bata dega.' });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/me', auth, async (req, res) => {
  const r = await pool.query('SELECT id,name,username,email,is_admin,balance_pkr FROM users WHERE id=$1', [req.user.id]);
  res.json({ user: r.rows[0] });
});

app.get('/api/settings-public', async (req, res) => {
  const s = await getSettings();
  res.json({ whatsapp_link: s.whatsapp_link, usd_pkr: num(s.usd_pkr, 276.43), usd_inr: num(s.usd_inr, 92.15), usd_sar: num(s.usd_sar, 3.75), margin_pct: num(s.margin_pct, 25) });
});

// ---------- Services ----------
function customerPricePkr(service, settings) {
  if (service.price_override_pkr != null) return num(service.price_override_pkr, 0);
  const cost = num(service.rate_usd, 0) * num(settings.usd_pkr, 276.43);
  return +(cost * (1 + num(settings.margin_pct, 25) / 100)).toFixed(2);
}
app.get('/api/services', auth, async (req, res) => {
  const s = await getSettings();
  const r = await pool.query('SELECT * FROM services_cache ORDER BY category, name');
  res.json({ services: r.rows.map(x => ({ ...x, price_pkr: customerPricePkr(x, s), rate_usd: num(x.rate_usd, 0) })), count: r.rows.length });
});
app.post('/api/services/sync', auth, requireAdmin, async (req, res) => {
  try { const n = await syncServices(); res.json({ ok: true, synced: n }); }
  catch (e) { res.status(500).json({ error: 'Dil sync failed: ' + e.message }); }
});

// ---------- Orders ----------
app.post('/api/orders', auth, async (req, res) => {
  try {
    const { service_id, link, quantity } = req.body || {};
    const qty = parseInt(quantity, 10);
    if (!service_id || !link || !Number.isFinite(qty) || qty < 1) return res.status(400).json({ error: 'Service, link aur quantity sahi likhein' });
    const s = await getSettings();
    const sr = await pool.query('SELECT * FROM services_cache WHERE service_id=$1', [service_id]);
    if (!sr.rows[0]) return res.status(404).json({ error: 'Service nahi mili — Admin se Dil sync karwayein' });
    const svc = sr.rows[0];
    if (qty < num(svc.min_qty, 1) || qty > num(svc.max_qty, 10000)) return res.status(400).json({ error: `Quantity ${svc.min_qty} se ${svc.max_qty} ke beech ho` });
    const unitPkr = customerPricePkr(svc, s); // Dil rate is per 1000
    const charge = +(unitPkr * qty / 1000).toFixed(2);
    const cost = +(num(svc.rate_usd, 0) * num(s.usd_pkr, 276.43) * qty / 1000).toFixed(2);
    const u = await pool.query('SELECT balance_pkr FROM users WHERE id=$1', [req.user.id]);
    if (num(u.rows[0].balance_pkr, 0) < charge) return res.status(400).json({ error: `Balance kam hai — zaroorat Rs ${charge}, wallet mein Rs ${u.rows[0].balance_pkr} hai. Pehle JazzCash se funds add karein.` });
    let providerId = null, status = 'Pending';
    try {
      const d = await dilCall({ action: 'add', service: service_id, link, quantity: qty });
      if (d.order) { providerId = String(d.order); status = 'In progress'; }
      else status = 'Pending';
    } catch (e) { console.warn('Dil order failed, saved as Pending:', e.message); }
    await pool.query('UPDATE users SET balance_pkr = balance_pkr - $1 WHERE id=$2', [charge, req.user.id]);
    const o = await pool.query(
      'INSERT INTO orders(user_id,service_id,service_name,link,quantity,charge_pkr,cost_pkr,status,provider_order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [req.user.id, service_id, svc.name, link, qty, charge, cost, status, providerId]);
    res.json({ ok: true, order: o.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});
app.get('/api/orders', auth, async (req, res) => {
  const r = req.user.is_admin
    ? await pool.query('SELECT o.*, u.username FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 200')
    : await pool.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200', [req.user.id]);
  res.json({ orders: r.rows });
});
app.get('/api/orders/:id/status', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM orders WHERE id=$1 AND (user_id=$2 OR $3)', [req.params.id, req.user.id, req.user.is_admin]);
    const o = r.rows[0];
    if (!o) return res.status(404).json({ error: 'Order nahi mila' });
    if (o.provider_order_id && DIL_API_KEY) {
      const d = await dilCall({ action: 'status', order: o.provider_order_id });
      if (d.status) { await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [d.status, o.id]); o.status = d.status; }
    }
    res.json({ order: o });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Wallet / JazzCash (simulated PIN flow) ----------
// Step 1: user enters amount + JazzCash mobile -> we create a pending payment and
// "send" a 4-digit PIN (simulated: returned in the response for demo; in production
// this would go through the JazzCash merchant SMS API).
app.post('/api/wallet/add-request', auth, async (req, res) => {
  const { amount, mobile } = req.body || {};
  const amt = num(amount, 0);
  if (amt < 10) return res.status(400).json({ error: 'Kam az kam Rs 10 add karein' });
  if (!mobile || String(mobile).length < 10) return res.status(400).json({ error: 'Sahi JazzCash mobile number likhein' });
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const r = await pool.query(
    "INSERT INTO payments(user_id,amount_pkr,method,mobile,pin_code,status) VALUES($1,$2,'JazzCash',$3,$4,'pending') RETURNING id",
    [req.user.id, amt, mobile, pin]);
  res.json({ ok: true, payment_id: r.rows[0].id, message: 'PIN aap ke JazzCash number par bhej diya gaya hai (demo: neeche dikhaya gaya PIN use karein).', demo_pin: pin });
});
app.post('/api/wallet/add-confirm', auth, async (req, res) => {
  const { payment_id, pin } = req.body || {};
  const r = await pool.query("SELECT * FROM payments WHERE id=$1 AND user_id=$2 AND status='pending'", [payment_id, req.user.id]);
  const p = r.rows[0];
  if (!p) return res.status(404).json({ error: 'Payment nahi mili ya pehle se confirm ho gayi' });
  if (String(pin) !== String(p.pin_code)) return res.status(400).json({ error: 'Galat PIN — dobara try karein' });
  await pool.query("UPDATE payments SET status='completed' WHERE id=$1", [payment_id]);
  await pool.query('UPDATE users SET balance_pkr = balance_pkr + $1 WHERE id=$2', [p.amount_pkr, req.user.id]);
  const u = await pool.query('SELECT balance_pkr FROM users WHERE id=$1', [req.user.id]);
  res.json({ ok: true, balance_pkr: u.rows[0].balance_pkr, message: `Rs ${p.amount_pkr} wallet mein add ho gaye!` });
});

// ---------- Support tickets + auto bot ----------
function botReply(subject, message) {
  const t = ((subject || '') + ' ' + (message || '')).toLowerCase();
  let help = '';
  if (t.includes('order') || t.includes('status') || t.includes('complete') || t.includes('deliver')) help = 'Order ka status aap Orders page par check kar sakte hain. Agar order "In progress" hai to thora wait karein, Dil provider se complete hote hi status update ho jayega.';
  else if (t.includes('payment') || t.includes('jazzcash') || t.includes('pin') || t.includes('wallet') || t.includes('fund') || t.includes('balance')) help = 'Payment ke liye Wallet page par JazzCash se funds add karein — amount aur mobile likhein, PIN aayega, PIN daal ke confirm karein, balance turant add ho jayega. Agar PIN na aaye to number dobara check karein.';
  else if (t.includes('price') || t.includes('rate') || t.includes('service') || t.includes('rate')) help = 'Services aur rates Services page par hain — rate Dil provider rate + 25% margin ke saath PKR mein dikhaye jate hain.';
  else if (t.includes('refund')) help = 'Refund ke liye order ID aur wajah likhein, Admin check karke jawab dega.';
  else help = 'Aap apna sawal detail mein likhein — order ID, service ya payment ki detail ho to zaroor likhein, taake Admin jaldi madad kar sake.';
  return 'Aapka issue owner ke samne kar diya gaya hai. ' + help;
}
app.post('/api/tickets', auth, async (req, res) => {
  const { subject, message } = req.body || {};
  if (!subject || !message) return res.status(400).json({ error: 'Subject aur message likhein' });
  const s = await getSettings();
  const botOn = s.support_bot_enabled === 'true';
  const t = await pool.query('INSERT INTO tickets(user_id,subject,bot_active) VALUES($1,$2,$3) RETURNING *', [req.user.id, subject, botOn]);
  await pool.query('INSERT INTO ticket_messages(ticket_id,sender,message) VALUES($1,$2,$3)', [t.rows[0].id, 'user', message]);
  if (botOn) await pool.query('INSERT INTO ticket_messages(ticket_id,sender,message) VALUES($1,$2,$3)', [t.rows[0].id, 'bot', botReply(subject, message)]);
  res.json({ ok: true, ticket: t.rows[0] });
});
app.get('/api/tickets', auth, async (req, res) => {
  const r = req.user.is_admin
    ? await pool.query('SELECT t.*, u.username FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 100')
    : await pool.query('SELECT * FROM tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  res.json({ tickets: r.rows });
});
app.get('/api/tickets/:id', auth, async (req, res) => {
  const t = await pool.query('SELECT * FROM tickets WHERE id=$1 AND (user_id=$2 OR $3)', [req.params.id, req.user.id, req.user.is_admin]);
  if (!t.rows[0]) return res.status(404).json({ error: 'Ticket nahi mila' });
  const m = await pool.query('SELECT * FROM ticket_messages WHERE ticket_id=$1 ORDER BY created_at', [req.params.id]);
  res.json({ ticket: t.rows[0], messages: m.rows });
});
app.post('/api/tickets/:id/reply', auth, async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message likhein' });
  const t = await pool.query('SELECT * FROM tickets WHERE id=$1 AND (user_id=$2 OR $3)', [req.params.id, req.user.id, req.user.is_admin]);
  if (!t.rows[0]) return res.status(404).json({ error: 'Ticket nahi mila' });
  const sender = req.user.is_admin ? 'admin' : 'user';
  await pool.query('INSERT INTO ticket_messages(ticket_id,sender,message) VALUES($1,$2,$3)', [req.params.id, sender, message]);
  if (req.user.is_admin) await pool.query('UPDATE tickets SET bot_active=false WHERE id=$1', [req.params.id]); // Admin takeover stops bot
  res.json({ ok: true });
});

// ---------- Admin ----------
app.get('/api/admin/overview', auth, requireAdmin, async (req, res) => {
  const users = await pool.query('SELECT COUNT(*)::int c, COALESCE(SUM(balance_pkr),0)::float total_balance FROM users');
  const orders = await pool.query('SELECT COUNT(*)::int c, COALESCE(SUM(charge_pkr),0)::float revenue, COALESCE(SUM(charge_pkr - cost_pkr),0)::float profit FROM orders');
  const pays = await pool.query("SELECT COUNT(*)::int c, COALESCE(SUM(amount_pkr),0)::float total FROM payments WHERE status='completed'");
  let dilBalance = null;
  try { const d = await dilCall({ action: 'balance' }); dilBalance = d.balance ?? d; } catch (e) { dilBalance = 'Dil API error: ' + e.message; }
  res.json({ users: users.rows[0], orders: orders.rows[0], payments: pays.rows[0], dilBalance, dilConfigured: !!DIL_API_KEY });
});
app.get('/api/admin/users', auth, requireAdmin, async (req, res) => {
  const r = await pool.query('SELECT id,name,username,email,is_admin,balance_pkr,created_at FROM users ORDER BY created_at');
  res.json({ users: r.rows });
});
app.post('/api/admin/reset-password', auth, requireAdmin, async (req, res) => {
  const { user_id, new_password } = req.body || {};
  if (!user_id || !new_password || new_password.length < 6) return res.status(400).json({ error: 'User aur naya password (6+ harf) zaroori hai' });
  const hash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, user_id]);
  await pool.query("UPDATE reset_requests SET status='done' WHERE user_id=$1 AND status='pending'", [user_id]);
  res.json({ ok: true, message: 'Password reset ho gaya — user ko naya password bata dein' });
});
app.get('/api/admin/reset-requests', auth, requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT rr.*, u.name, u.username, u.email FROM reset_requests rr JOIN users u ON u.id=rr.user_id WHERE rr.status='pending' ORDER BY rr.created_at DESC");
  res.json({ requests: r.rows });
});
app.get('/api/admin/settings', auth, requireAdmin, async (req, res) => {
  const s = await getSettings();
  res.json({ settings: { ...s, dil_api_key_set: !!DIL_API_KEY } });
});
app.post('/api/admin/settings', auth, requireAdmin, async (req, res) => {
  const allowed = ['margin_pct', 'usd_pkr', 'usd_inr', 'usd_sar', 'whatsapp_link', 'support_bot_enabled', 'dil_api_url'];
  for (const k of allowed) if (req.body[k] !== undefined) {
    await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [k, String(req.body[k])]);
  }
  res.json({ ok: true, message: 'Settings save ho gayi. Note: DIL_API_KEY Render > Environment mein set hoti hai, yahan nahi.' });
});
app.post('/api/admin/services/:id/price', auth, requireAdmin, async (req, res) => {
  const { price_override_pkr } = req.body || {};
  await pool.query('UPDATE services_cache SET price_override_pkr=$1 WHERE service_id=$2', [price_override_pkr === null ? null : num(price_override_pkr, 0), req.params.id]);
  res.json({ ok: true });
});
app.get('/api/admin/payments', auth, requireAdmin, async (req, res) => {
  const r = await pool.query('SELECT p.*, u.username FROM payments p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200');
  res.json({ payments: r.rows });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initDb().then(() => app.listen(PORT, () => console.log(`ZAHIDSMM running on port ${PORT}`)))
  .catch(e => { console.error('DB init failed:', e.message); app.listen(PORT, () => console.log(`ZAHIDSMM running on port ${PORT} (DB unavailable)`)); });
