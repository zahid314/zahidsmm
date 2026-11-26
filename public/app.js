// ZAHIDSMM frontend — plain JS, calls /api/*
let token = localStorage.getItem('zh_token') || '';
let user = null;
let rates = { usd_pkr: 276.43, usd_inr: 92.15, usd_sar: 3.75, margin_pct: 25 };
let whatsapp = 'https://whatsapp.com/channel/0029VbEUyRXLY6dBG6K9jo0F';
let services = [];
let currency = localStorage.getItem('zh_cur') || 'PKR';
let jazzcashLive = false;
let jazzcashEnv = 'sandbox';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}
function fmt(pkr) {
  pkr = Number(pkr) || 0;
  if (currency === 'PKR') return 'Rs ' + pkr.toLocaleString('en-PK', { maximumFractionDigits: 2 });
  if (currency === 'USD') return '$' + (pkr / rates.usd_pkr).toFixed(2);
  if (currency === 'INR') return '₹' + (pkr / rates.usd_pkr * rates.usd_inr).toFixed(2);
  return 'SR ' + (pkr / rates.usd_pkr * rates.usd_sar).toFixed(2);
}
function showMsg(el, t) { if (el) el.textContent = t; }

async function loadPublic() {
  try {
    const d = await api('/api/settings-public'); rates = d; whatsapp = d.whatsapp_link || whatsapp;
    jazzcashLive = !!d.jazzcash_connected; jazzcashEnv = d.jazzcash_env || 'sandbox';
  } catch {}
  document.querySelectorAll('.wa-btn,.wa-card').forEach(a => a.href = whatsapp);
  $('waBtn').href = whatsapp;
  $('currencySel').value = currency;
  const st = $('jazzcashStatus');
  if (st) st.textContent = jazzcashLive
    ? `JazzCash LIVE hai (${jazzcashEnv === 'production' ? 'Production — asli paise' : 'Sandbox — test mode'}): amount + apna JazzCash mobile likhein, phir MPIN se payment hogi aur paise merchant account mein aate hi balance khud add ho jayega.`
    : 'JazzCash DEMO mode hai — merchant abhi connect nahi hai. PIN wala flow demo hai, is se asli paise nahi aayenge. Owner Admin > Settings mein JazzCash Merchant ID / Password / Salt daalein.';
}

function showApp() {
  $('authScreen').classList.add('hidden');
  $('appScreen').classList.remove('hidden');
  $('logoutBtn').classList.remove('hidden');
  $('hello').textContent = `Assalam-o-Alaikum, ${user.name} (${user.username})${user.is_admin ? ' — Owner/Admin' : ''}`;
  if (user.is_admin) { $('adminNav').classList.remove('hidden'); $('syncBtn').classList.remove('hidden'); }
  loadDashboard(); showPage('dashboard');
}
function showPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.add('hidden'));
  $('page-' + p).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  if (p === 'services') loadServices();
  if (p === 'orders') loadOrders();
  if (p === 'support') loadTickets();
  if (p === 'admin') loadAdmin();
  if (p === 'neworder') loadOrderForm();
  if (p === 'wallet') loadDashboard();
}
async function loadDashboard() {
  try {
    const d = await api('/api/me'); user = d.user;
    $('bal').textContent = fmt(user.balance_pkr);
    $('walletBal').textContent = fmt(user.balance_pkr);
    const o = await api('/api/orders'); $('ordCount').textContent = o.orders.length;
    const s = await api('/api/services'); services = s.services; $('svcCount').textContent = s.count;
  } catch (e) { showMsg($('appMsg'), e.message); }
}
async function loadServices() {
  const q = ($('svcSearch').value || '').toLowerCase();
  const list = services.filter(s => !q || (s.name + ' ' + s.category).toLowerCase().includes(q));
  $('svcList').innerHTML = list.slice(0, 200).map(s =>
    `<div class="svc"><b>${esc(s.name)}</b> <span>${esc(s.category || '')}</span><br>
     Rate: <span class="price">${fmt(s.price_pkr)}</span> / 1000 &nbsp; Min ${s.min_qty} – Max ${s.max_qty} &nbsp; ID ${s.service_id}</div>`).join('')
    || '<p>Koi service nahi mili — Admin Dil se Sync karein.</p>';
}
function loadOrderForm() {
  $('ordService').innerHTML = services.map(s => `<option value="${s.service_id}">${esc(s.name)} — ${fmt(s.price_pkr)}/1000</option>`).join('');
  updateOrderPrice();
}
function updateOrderPrice() {
  const s = services.find(x => x.service_id == $('ordService').value);
  const qty = Number($('ordQty').value) || 0;
  $('ordPrice').textContent = s && qty ? `Total: ${fmt(s.price_pkr * qty / 1000)}` : '';
}
async function loadOrders() {
  const d = await api('/api/orders');
  $('ordersList').innerHTML = d.orders.map(o =>
    `<div class="ord"><b>#${o.id} ${esc(o.service_name || '')}</b> — ${esc(o.status)}<br>
     Link: ${esc(o.link)}<br>Qty: ${o.quantity} | Charge: ${fmt(o.charge_pkr)} | ${new Date(o.created_at).toLocaleString()}</div>`).join('')
    || '<p>Abhi koi order nahi hai.</p>';
}
async function loadTickets() {
  const d = await api('/api/tickets');
  $('ticketList').innerHTML = d.tickets.map(t =>
    `<div class="ticket"><b>#${t.id} ${esc(t.subject)}</b> — ${esc(t.status)} ${t.bot_active ? '(Bot ON)' : '(Bot OFF — Admin)'}<br>
     <button class="btn small" onclick="openTicket(${t.id})">Kholein</button></div>`).join('') || '<p>Koi ticket nahi hai.</p>';
}
window.openTicket = async function (id) {
  const d = await api('/api/tickets/' + id);
  $('ticketDetail').classList.remove('hidden');
  $('ticketDetail').innerHTML = `<h3>#${d.ticket.id} ${esc(d.ticket.subject)}</h3>` +
    d.messages.map(m => `<p><b>${esc(m.sender)}:</b> ${esc(m.message)}</p>`).join('') +
    `<input id="tkReply" placeholder="Jawab likhein..."><button class="btn primary" onclick="replyTicket(${id})">Bhejein</button>`;
};
window.replyTicket = async function (id) {
  try { await api('/api/tickets/' + id + '/reply', { method: 'POST', body: JSON.stringify({ message: $('tkReply').value }) }); openTicket(id); loadTickets(); }
  catch (e) { alert(e.message); }
};
async function loadAdmin() {
  try {
    const d = await api('/api/admin/overview');
    $('adminStats').innerHTML = `Users: ${d.users.c} | Orders: ${d.orders.c} | Revenue: ${fmt(d.orders.revenue)} | Profit: ${fmt(d.orders.profit)} | Payments: ${fmt(d.payments.total)}<br>Dil Balance: ${esc(String(d.dilBalance))} | Dil API: ${d.dilConfigured ? 'Connected' : 'NOT SET — Render env mein DIL_API_KEY set karein'}`;
    const rr = await api('/api/admin/reset-requests');
    $('resetList').innerHTML = rr.requests.map(r => `<div class="usr">${esc(r.name)} (${esc(r.username)} — ${esc(r.email)}) <button class="btn small" onclick="resetPw(${r.user_id})">Reset Password</button></div>`).join('') || '<p>Koi pending request nahi.</p>';
    const u = await api('/api/admin/users');
    $('userList').innerHTML = u.users.map(x => `<div class="usr">${esc(x.name)} (${esc(x.username)}) — ${esc(x.email)} — Balance ${fmt(x.balance_pkr)} ${x.is_admin ? '— ADMIN' : ''} <button class="btn small" onclick="resetPw(${x.id})">Reset Password</button><br><input id="balAmt-${x.id}" type="number" min="1" placeholder="Rs amount" style="width:130px"> <button class="btn small" onclick="addBalance(${x.id})">Balance Add Karein</button></div>`).join('');
    const s = await api('/api/admin/settings');
    $('setMargin').value = s.settings.margin_pct; $('setPkr').value = s.settings.usd_pkr;
    $('setInr').value = s.settings.usd_inr; $('setSar').value = s.settings.usd_sar;
    $('setWa').value = s.settings.whatsapp_link; $('setBot').value = s.settings.support_bot_enabled;
    // JazzCash credentials are NEVER returned by the server — only set/not-set
    // flags. Inputs stay blank; a blank field keeps the saved value.
    $('setJcEnv').value = s.settings.jazzcash_env || 'sandbox';
    $('setJcStatus').textContent = s.settings.jazzcash_connected
      ? `JazzCash CONNECTED hai (${s.settings.jazzcash_env || 'sandbox'}). Merchant ID: ${s.settings.jazzcash_merchant_id_set ? 'set hai' : 'nahi hai'} | Password: ${s.settings.jazzcash_password_set ? 'set hai' : 'nahi hai'} | Salt: ${s.settings.jazzcash_salt_set ? 'set hai' : 'nahi hai'}.`
      : 'JazzCash abhi connect NAHI hai — Merchant ID, Password aur Salt teeno daalein, phir Save karein.';
  } catch (e) { showMsg($('appMsg'), e.message); }
}
window.addBalance = async function (uid) {
  const amt = Number(($('balAmt-' + uid) || {}).value);
  if (!amt || amt <= 0) { alert('Pehle Rs amount likhein.'); return; }
  const note = prompt('Note (optional) — jaise JazzCash TID / screenshot ka reference:') || '';
  try { const d = await api('/api/admin/users/' + uid + '/add-balance', { method: 'POST', body: JSON.stringify({ amount: amt, note }) }); alert(d.message); loadAdmin(); }
  catch (e) { alert(e.message); }
};
window.resetPw = async function (uid) {
  const np = prompt('Naya password likhein (user ko ye bata dein):');
  if (!np) return;
  try { await api('/api/admin/reset-password', { method: 'POST', body: JSON.stringify({ user_id: uid, new_password: np }) }); alert('Password reset ho gaya!'); loadAdmin(); }
  catch (e) { alert(e.message); }
};

// ---- events ----
$('tabLogin').onclick = () => { $('tabLogin').classList.add('active'); $('tabSignup').classList.remove('active'); $('loginForm').classList.remove('hidden'); $('signupForm').classList.add('hidden'); };
$('tabSignup').onclick = () => { $('tabSignup').classList.add('active'); $('tabLogin').classList.remove('active'); $('signupForm').classList.remove('hidden'); $('loginForm').classList.add('hidden'); };
$('loginForm').onsubmit = async e => {
  e.preventDefault();
  try { const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ login: $('loginId').value, password: $('loginPass').value }) }); token = d.token; user = d.user; localStorage.setItem('zh_token', token); showApp(); }
  catch (err) { showMsg($('authMsg'), err.message); }
};
$('signupForm').onsubmit = async e => {
  e.preventDefault();
  try { const d = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: $('suName').value, username: $('suUser').value, email: $('suEmail').value, password: $('suPass').value }) }); token = d.token; user = d.user; localStorage.setItem('zh_token', token); alert(d.message || 'Signup ho gaya!'); showApp(); }
  catch (err) { showMsg($('authMsg'), err.message); }
};
$('forgotLink').onclick = e => { e.preventDefault(); $('forgotBox').classList.toggle('hidden'); };
$('forgotBtn').onclick = async () => {
  try { const d = await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ login: $('forgotId').value }) }); showMsg($('authMsg'), d.message); }
  catch (e) { showMsg($('authMsg'), e.message); }
};
$('gmailBtn').onclick = () => {
  const g = prompt('Apni Gmail likhein:');
  if (!g) return;
  $('suEmail').value = g; $('loginId').value = g;
  $('tabSignup').click();
  showMsg($('authMsg'), 'Gmail fill ho gayi — ab naam/username/password likh ke Signup karein, ya Login mein password likhein.');
};
$('logoutBtn').onclick = () => { token = ''; user = null; localStorage.removeItem('zh_token'); location.reload(); };
$('currencySel').onchange = e => { currency = e.target.value; localStorage.setItem('zh_cur', currency); loadDashboard(); loadServices(); };
document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => showPage(b.dataset.page));
$('svcSearch').oninput = loadServices;
$('syncBtn').onclick = async () => { try { const d = await api('/api/services/sync', { method: 'POST' }); alert(d.synced + ' services sync ho gayi!'); loadDashboard(); loadServices(); } catch (e) { alert(e.message); } };
$('ordService').onchange = updateOrderPrice; $('ordQty').oninput = updateOrderPrice;
$('ordBtn').onclick = async () => {
  try { const d = await api('/api/orders', { method: 'POST', body: JSON.stringify({ service_id: Number($('ordService').value), link: $('ordLink').value, quantity: Number($('ordQty').value) }) }); alert('Order lag gaya! #' + d.order.id + ' — ' + d.order.status); loadDashboard(); showPage('orders'); }
  catch (e) { alert(e.message); }
};
let payId = null;
let payMode = 'demo';
$('addReqBtn').onclick = async () => {
  try {
    const d = await api('/api/wallet/add-request', { method: 'POST', body: JSON.stringify({ amount: Number($('addAmt').value), mobile: $('addMobile').value, cnic: $('addCnic').value || '' }) });
    payId = d.payment_id; payMode = d.mode || 'demo'; $('pinBox').classList.remove('hidden');
    $('pinInput').value = '';
    $('pinInput').placeholder = payMode === 'live' ? 'Apna JazzCash MPIN (4 digits)' : 'Demo PIN (screen par dikhaya gaya)';
    $('pinInfo').textContent = d.message + (d.demo_pin ? ` Demo PIN: ${d.demo_pin}` : '');
  } catch (e) { alert(e.message); }
};
$('pinConfirmBtn').onclick = async () => {
  try { const d = await api('/api/wallet/add-confirm', { method: 'POST', body: JSON.stringify({ payment_id: payId, pin: $('pinInput').value }) }); alert(d.message); $('pinInput').value = ''; $('pinBox').classList.add('hidden'); loadDashboard(); }
  catch (e) { $('pinInput').value = ''; alert(e.message); }
};
$('tkBtn').onclick = async () => {
  try { await api('/api/tickets', { method: 'POST', body: JSON.stringify({ subject: $('tkSubject').value, message: $('tkMsg').value }) }); alert('Ticket bhej diya — bot ne foran jawab diya hai, ticket khol ke dekhein.'); loadTickets(); }
  catch (e) { alert(e.message); }
};
$('saveSettingsBtn').onclick = async () => {
  try {
    const body = { margin_pct: $('setMargin').value, usd_pkr: $('setPkr').value, usd_inr: $('setInr').value, usd_sar: $('setSar').value, whatsapp_link: $('setWa').value, support_bot_enabled: $('setBot').value, jazzcash_env: $('setJcEnv').value };
    // JazzCash credentials: send only non-empty fields — blank keeps the saved value.
    if ($('setJcId').value.trim()) body.jazzcash_merchant_id = $('setJcId').value.trim();
    if ($('setJcPass').value) body.jazzcash_password = $('setJcPass').value;
    if ($('setJcSalt').value) body.jazzcash_salt = $('setJcSalt').value;
    await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(body) });
    $('setJcPass').value = ''; $('setJcSalt').value = '';
    alert('Settings save ho gayi!'); loadPublic(); loadAdmin();
  } catch (e) { alert(e.message); }
};

// ---- boot ----
(async () => {
  await loadPublic();
  if (token) { try { const d = await api('/api/me'); user = d.user; showApp(); } catch { token = ''; localStorage.removeItem('zh_token'); } }
})();
