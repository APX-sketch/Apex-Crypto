// Wallet view — reads the REAL authenticated balance from the server.
//
// FIX: this page used to call /api/wallet/:userId (the demo PortfolioStore,
// which is a separate store that always starts at zero and takes the id from
// the URL). That is why it always showed $0.00 even after an admin credit.
// It now reads the logged-in user's real balances from /api/wallet/me (the
// same source the admin "liquidity" dashboard uses) and values them with live
// prices from /api/markets — so admin credits/transfers/trades show up here.

// ---- auth: the token is the source of identity, never the URL ----
const SESS = (() => { try { return JSON.parse(localStorage.getItem('skygo_session') || '{}') || {}; } catch (e) { return {}; } })();
const TOK = SESS.token || localStorage.getItem('apex_token') || '';

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => `${n >= 0 ? '+' : ''}${Number(n || 0).toFixed(2)}%`;

function paint(el, text, positive) {
    const node = document.getElementById(el);
    if (!node) return;
    node.textContent = text;
    node.classList.remove('up', 'down');
    if (positive === true) node.classList.add('up');
    if (positive === false) node.classList.add('down');
}

// Live prices from OUR server cache (never Binance directly).
const STABLES = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI']);
let PRICES = {}; // sym 'BTCUSDT' -> { price, pct }
async function loadPrices() {
    try {
        const r = await fetch('/api/markets', { headers: { 'Accept': 'application/json' } });
        if (!r.ok) return;
        const raw = await r.json();
        const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.data) ? raw.data : Object.values(raw));
        const map = {};
        arr.forEach((d) => {
            const sym = d.symbol || d.s; if (!sym) return;
            const last = d.lastPrice != null ? d.lastPrice : (d.c != null ? d.c : (d.price != null ? d.price : d.p));
            const ch = d.priceChangePercent != null ? d.priceChangePercent : (d.P != null ? d.P : 0);
            map[sym] = { price: parseFloat(last) || 0, pct: parseFloat(ch) || 0 };
        });
        PRICES = map;
    } catch (e) { /* keep old prices on error */ }
}
function priceOf(coin) {
    if (STABLES.has(coin)) return 1;
    const p = PRICES[coin + 'USDT'];
    return p ? p.price : 0;
}
function change24Of(coin) {
    if (STABLES.has(coin)) return 0;
    const p = PRICES[coin + 'USDT'];
    return p ? p.pct : 0;
}

async function load() {
    if (!TOK) { // not logged in — send the user to login
        document.getElementById('balance') && (document.getElementById('balance').textContent = money(0));
        return;
    }
    try {
        await loadPrices();
        const res = await fetch('/api/wallet/me', { headers: { 'Authorization': 'Bearer ' + TOK } });
        if (!res.ok) return;
        const d = await res.json();
        const balances = d.balances || {};

        // Total value + 24h P&L (same method the home page uses).
        let total = 0, pnl24 = 0;
        for (const c in balances) {
            const amt = Number(balances[c]) || 0;
            if (amt <= 0) continue;
            const v = amt * priceOf(c);
            total += v;
            const ch = change24Of(c);
            if (ch) pnl24 += v - (v / (1 + ch / 100));
        }
        const base = total - pnl24;
        const totalProfitPct = base > 0 ? (pnl24 / base * 100) : 0;

        const balEl = document.getElementById('balance');
        if (balEl) balEl.textContent = money(total);
        paint('totalPct', pct(totalProfitPct), totalProfitPct >= 0);
        paint('p24', money(pnl24), pnl24 >= 0);
    } catch (e) { /* ignore transient errors */ }
}

// Presence heartbeat so the admin "active/online" flag is accurate while the
// user is simply viewing their wallet (does NOT touch balances server-side).
function syncSeen() {
    if (!TOK) return;
    try {
        fetch('/api/wallet/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOK },
        }).catch(() => {});
    } catch (e) {}
}

load();
setInterval(load, 8000);
syncSeen();
setInterval(syncSeen, 20000);
