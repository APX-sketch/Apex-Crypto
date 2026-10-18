// server.js
// Express server: pulls prices from Binance on the server side, caches them,
// and serves them to clients. Clients read from THIS server, not from Binance.
// Hardened with rate limiting, security headers (helmet) and CORS.

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHmac, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';

import { PriceCache } from './lib/priceCache.js';
import { PortfolioStore } from './lib/portfolio.js';
import { MarketCache } from './lib/marketCache.js';
import { BinanceProxy } from './lib/binanceProxy.js';
import { getActiveSource } from './lib/binanceHosts.js';
import { Store, publicUser } from './lib/store.js';
import { ApxStore } from './lib/apxStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Config (env with sensible defaults) ----
const PORT = Number(process.env.PORT || 3000);
const SYMBOLS = (process.env.SYMBOLS || 'BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const REFRESH_MS = Number(process.env.REFRESH_MS || 5000);
const ALERT_THRESHOLD = Number(process.env.ALERT_THRESHOLD || 5);
const ALERT_SYMBOLS = (process.env.ALERT_SYMBOLS || 'BTCUSDT,ETHUSDT')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map((s) => s.trim()).filter(Boolean);

// ---- Admin credentials (CHANGE THESE via env in production!) ----
// DEMO defaults. Set ADMIN_USER / ADMIN_PASS env vars for anything real.
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'apex-admin-2024';
// Whether newly registered users need admin approval before they can log in.
const REQUIRE_APPROVAL = (process.env.REQUIRE_APPROVAL || 'true') !== 'false';

// ---- Persistent demo store (users / sessions / support chat) ----
const store = new Store(join(__dirname, 'data', 'apex-data.json'));

// ---- APX platform coin central store (price / history / big-order alerts) ----
// كاش شموع BTC لكل فاصل زمني (يستخدم لبذر شكل شارت APX مثل BTC تماماً)
let _apxBtcKl = {};
const apx = new ApxStore(join(__dirname, 'data', 'apex-apx.json'), {
  bigOrder: Number(process.env.APX_BIG_ORDER || 5000),
  btcKlines: (iv) => _apxBtcKl[iv] || null,
});
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
  
});

// ============================================================
//  MySQL USER LAYER (identity + status + KYC) — source of truth
// ------------------------------------------------------------
//  The users table in MySQL is the single source of truth for a user's
//  identity and KYC/approval status. The JSON `store` stays as the ledger
//  for balances / orders / notifications / transactions, keyed by the SAME
//  user id (as a string). This block adds: idempotent schema bootstrap,
//  password hashing (scrypt) with a legacy-plaintext upgrade path, and
//  stateless signed session tokens so login issues a token that the user
//  routes actually accept.
// ============================================================

// Stable secret for signing user session tokens. Prefer an env var so tokens
// survive restarts; fall back to a persisted random secret in data/ so a
// fresh deploy without the env var still keeps sessions stable across
// restarts on the same disk.
const SESSION_SECRET = (() => {
  if (process.env.SESSION_SECRET) return String(process.env.SESSION_SECRET);
  try {
    const f = join(__dirname, 'data', 'session-secret.txt');
    if (existsSync(f)) return readFileSync(f, 'utf8').trim();
    mkdirSync(dirname(f), { recursive: true });
    const s = randomBytes(48).toString('hex');
    writeFileSync(f, s);
    return s;
  } catch (e) { return randomBytes(48).toString('hex'); }
})();
const TOKEN_TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 24 * 60 * 60 * 1000); // 30 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Hash a password with scrypt. Format: s2$<saltHex>$<hashHex>
function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, 64);
  return 's2$' + salt.toString('hex') + '$' + hash.toString('hex');
}
// Verify a password. Returns { ok, legacy } — `legacy:true` means the stored
// value was plaintext (pre-hashing) and matched, so the caller should re-hash
// and persist the upgraded value.
function verifyPassword(plain, stored) {
  const s = String(stored == null ? '' : stored);
  if (s.startsWith('s2$')) {
    const parts = s.split('$');
    if (parts.length !== 3) return { ok: false, legacy: false };
    try {
      const salt = Buffer.from(parts[1], 'hex');
      const expected = Buffer.from(parts[2], 'hex');
      const got = scryptSync(String(plain), salt, expected.length);
      return { ok: expected.length === got.length && timingSafeEqual(expected, got), legacy: false };
    } catch (e) { return { ok: false, legacy: false }; }
  }
  // Legacy plaintext comparison (constant-time-ish).
  const a = Buffer.from(String(plain));
  const b = Buffer.from(s);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return { ok, legacy: ok };
}
// Issue a stateless signed session token for a user id.
function signUserToken(userId) {
  const payload = String(userId) + '.' + (Date.now() + TOKEN_TTL_MS);
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest();
  return b64url(payload) + '.' + b64url(sig);
}
// Verify a user token; returns the user id string or null.
function verifyUserToken(token) {
  try {
    const t = String(token || '');
    const dot = t.lastIndexOf('.');
    if (dot <= 0) return null;
    const payloadB64 = t.slice(0, dot);
    const sigB64 = t.slice(dot + 1);
    const payload = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest();
    const got = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
    const [id, exp] = payload.split('.');
    if (!id || Number(exp) < Date.now()) return null;
    return String(id);
  } catch (e) { return null; }
}

// Read a single user row (identity + status) by id / email.
async function dbGetUserById(id) {
  const [rows] = await pool.query(
    'SELECT id, username, name, email, password, status, country, reject_reason, created_at, last_seen FROM users WHERE id = ? LIMIT 1',
    [id]);
  return rows[0] || null;
}
async function dbGetUserByEmail(email) {
  const [rows] = await pool.query(
    'SELECT id, username, name, email, password, status, country, reject_reason, created_at, last_seen FROM users WHERE email = ? LIMIT 1',
    [String(email).trim().toLowerCase()]);
  return rows[0] || null;
}
// Shape a DB user row into the public object the frontend/admin expect.
function dbPublicUser(u) {
  if (!u) return null;
  return {
    id: String(u.id), uid: u.id,
    name: u.name || u.username || u.email,
    username: u.username || u.name || u.email,
    email: u.email,
    country: u.country || '',
    status: u.status || 'pending',
    rejectReason: u.reject_reason || '',
    createdAt: u.created_at ? new Date(u.created_at).toISOString() : null,
  };
}

// Idempotent schema bootstrap: add the columns / tables the app needs if they
// are missing. Safe to run on every startup (checks information_schema first,
// so it never errors on an already-migrated DB).
async function ensureColumn(table, column, ddl) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column]);
  if (rows[0] && rows[0].n === 0) {
    await pool.query('ALTER TABLE `' + table + '` ADD COLUMN ' + ddl);
    console.log('[schema] added ' + table + '.' + column);
  }
}
async function ensureSchema() {
  // users: identity columns already exist (id, username, email, password).
  await ensureColumn('users', 'name', '`name` VARCHAR(120) NULL');
  await ensureColumn('users', 'status', "`status` VARCHAR(20) NOT NULL DEFAULT 'pending'");
  await ensureColumn('users', 'country', '`country` VARCHAR(80) NULL');
  await ensureColumn('users', 'reject_reason', '`reject_reason` VARCHAR(400) NULL');
  await ensureColumn('users', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('users', 'last_seen', '`last_seen` BIGINT NOT NULL DEFAULT 0');
  // identity documents (KYC): one row per user, holds the base64 image.
  await pool.query(
    'CREATE TABLE IF NOT EXISTS id_documents (' +
    ' user_id INT NOT NULL PRIMARY KEY,' +
    ' doc_type VARCHAR(40) NULL,' +
    ' image LONGTEXT NULL,' +
    ' created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' +
    ')');
  // wallets (balance ledger) — register already inserts into this.
  await pool.query(
    'CREATE TABLE IF NOT EXISTS wallets (' +
    ' id INT AUTO_INCREMENT PRIMARY KEY,' +
    ' user_id INT NOT NULL,' +
    ' currency VARCHAR(12) NOT NULL DEFAULT "USDT",' +
    ' balance DECIMAL(30,8) NOT NULL DEFAULT 0,' +
    ' locked_balance DECIMAL(30,8) NOT NULL DEFAULT 0,' +
    ' UNIQUE KEY uq_user_cur (user_id, currency)' +
    ')');
}
ensureSchema()
  .then(() => console.log('[schema] ensured OK'))
  .catch((e) => console.error('[schema] ensure FAILED:', e.message));

// ---- Platform commission ledger (trading fees collected) ----
// Server-authoritative accumulator for trading fees. Each executed trade on
// the client reports its fee here; it is tracked SEPARATELY from user balances
// (users' money) — exactly like a real exchange keeps a revenue/commission
// account apart from customer funds. Persisted to its own JSON file so the
// admin panel can read the running total across restarts.
const COMMISSION_FILE = join(__dirname, 'data', 'apex-commission.json');
function loadCommission() {
  try {
    if (existsSync(COMMISSION_FILE)) {
      const d = JSON.parse(readFileSync(COMMISSION_FILE, 'utf8'));
      return { totals: d.totals || {}, count: Number(d.count) || 0, entries: Array.isArray(d.entries) ? d.entries : [] };
    }
  } catch (e) { /* ignore corrupt / missing file */ }
  return { totals: {}, count: 0, entries: [] };
}
const commission = loadCommission();
function saveCommission() {
  try {
    mkdirSync(dirname(COMMISSION_FILE), { recursive: true });
    writeFileSync(COMMISSION_FILE, JSON.stringify(commission));
  } catch (e) { console.warn('[commission] save failed:', e.message); }
}
// Add one fee into the platform commission account. Returns the new per-currency
// total, or null if the input is invalid.
function recordCommission({ amount, currency, userId, userName, source }) {
  const amt = Number(amount);
  const cur = String(currency || 'USDT').toUpperCase();
  if (!(amt > 0) || !isFinite(amt)) return null;
  if (!/^[A-Z0-9]{2,12}$/.test(cur)) return null;
  commission.totals[cur] = (Number(commission.totals[cur]) || 0) + amt;
  commission.count += 1;
  commission.entries.unshift({
    amount: amt, currency: cur, userId: String(userId || ''),
    userName: String(userName || ''), source: String(source || 'trade').slice(0, 24),
    at: Date.now(),
  });
  if (commission.entries.length > 500) commission.entries.length = 500;
  saveCommission();
  return commission.totals[cur];
}

// ---- Futures wallet (SEPARATE from the Spot balance) ----
// Money safety: the futures wallet is a server-authoritative store, kept in its
// own JSON file, exactly like the commission ledger. Spot balances live inside
// the user record (store.applyDeltas / debitBalance), futures balances live
// here, keyed by user id. The only way money moves between the two is the
// atomic internal-transfer route below, which debits one side (rejecting any
// below-zero result) BEFORE crediting the other, with rollback on failure.
// No path here can create balance from nothing.
const FUTURES_FILE = join(__dirname, 'data', 'apex-futures.json');
function loadFutures() {
  try {
    if (existsSync(FUTURES_FILE)) {
      const d = JSON.parse(readFileSync(FUTURES_FILE, 'utf8'));
      return (d && typeof d === 'object' && d.wallets && typeof d.wallets === 'object') ? d.wallets : {};
    }
  } catch (e) { /* ignore corrupt / missing file */ }
  return {};
}
const futuresWallets = loadFutures(); // { userId: { USDT: 12.5, BTC: 0.1, ... } }
function saveFutures() {
  try {
    mkdirSync(dirname(FUTURES_FILE), { recursive: true });
    writeFileSync(FUTURES_FILE, JSON.stringify({ wallets: futuresWallets }));
  } catch (e) { console.warn('[futures] save failed:', e.message); }
}
function futuresBalances(userId) {
  const w = futuresWallets[userId];
  return (w && typeof w === 'object') ? w : {};
}
// Apply a signed per-currency delta to a user's futures wallet ATOMICALLY.
// Returns the new balances on success, or null if ANY resulting balance would
// go below zero (so money can never be created). Nothing is persisted on
// rejection. `amt` values must be finite numbers.
function futuresApply(userId, deltas) {
  const cur = futuresBalances(userId);
  const next = {};
  for (const k in cur) next[k] = Number(cur[k]) || 0;
  for (const rawK in deltas) {
    const k = String(rawK).toUpperCase();
    const d = Number(deltas[rawK]);
    if (!isFinite(d)) return null;
    const v = (Number(next[k]) || 0) + d;
    if (v < -1e-9) return null; // would create money / overdraw -> reject
    next[k] = v < 1e-12 ? 0 : v;
  }
  // drop zeroed-out currencies to keep the wallet tidy
  for (const k in next) if (!(next[k] > 0)) delete next[k];
  futuresWallets[userId] = next;
  saveFutures();
  return next;
}

// ---- Security log: balance-tampering / money-safety events ----
// Dedicated, append-only audit trail for every ATTEMPT to move money in a way
// the server refuses: trying to spend more than you own (applyDeltas / debit
// rejected -> money would be created from nothing), tampered request payloads
// (NaN / negative deltas, mismatched symbol, over-cap notional), and invalid
// client-reported fees. Kept in its own JSON file, SEPARATE from the admin
// action log, so security review stays focused on money-safety.
const SECURITY_FILE = join(__dirname, 'data', 'apex-security.json');
function loadSecurity() {
  try {
    if (existsSync(SECURITY_FILE)) {
      const d = JSON.parse(readFileSync(SECURITY_FILE, 'utf8'));
      return { count: Number(d.count) || 0, entries: Array.isArray(d.entries) ? d.entries : [] };
    }
  } catch (e) { /* ignore corrupt / missing file */ }
  return { count: 0, entries: [] };
}
const security = loadSecurity();
function saveSecurity() {
  try {
    mkdirSync(dirname(SECURITY_FILE), { recursive: true });
    writeFileSync(SECURITY_FILE, JSON.stringify(security));
  } catch (e) { console.warn('[security] save failed:', e.message); }
}
// Best-effort client IP (honours a single x-forwarded-for hop behind a proxy).
function clientIp(req) {
  const xf = String((req && req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return (xf || (req && req.ip) || (req && req.socket && req.socket.remoteAddress) || '').slice(0, 60);
}
// Core writer. severity: 'critical' (money would be created) | 'warning' | 'info'.
function logSecurityEvent({ user = null, ip = '', ua = '', path = '', kind, severity = 'warning', detail = '', meta = null }) {
  const entry = {
    id: 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    at: Date.now(),
    kind: String(kind || '').slice(0, 40),
    severity: (severity === 'critical' || severity === 'info') ? severity : 'warning',
    detail: String(detail || '').slice(0, 300),
    userId: user ? (user.id || '') : '',
    uid: user ? (user.uid || '') : '',
    userName: user ? (user.name || '') : '',
    userEmail: user ? (user.email || '') : '',
    ip: ip || '', ua: String(ua || '').slice(0, 180), path: String(path || '').slice(0, 80),
    meta: (meta && typeof meta === 'object') ? meta : null,
  };
  security.entries.unshift(entry);
  security.count += 1;
  if (security.entries.length > 1000) security.entries.length = 1000; // cap stored history
  saveSecurity();
  const tag = entry.severity === 'critical' ? '[SECURITY!]' : '[security]';
  console.warn(`${tag} ${entry.kind} user=${entry.userEmail || entry.userId || '-'} ip=${entry.ip} ${entry.detail}`);
  return entry;
}
// Convenience wrapper that pulls user/ip/ua/path straight off an Express req.
function logSecurity(req, opts) {
  return logSecurityEvent({
    user: (req && req.user) ? req.user : null,
    ip: clientIp(req),
    ua: (req && req.headers && req.headers['user-agent']) || '',
    path: req ? (req.method + ' ' + (req.originalUrl || req.url || '')) : '',
    ...opts,
  });
}
// Scan a client-sent deltas object for tamper signatures (NaN / Infinity).
function inspectDeltas(deltas) {
  const bad = [];
  for (const k in deltas) { if (!isFinite(Number(deltas[k]))) bad.push(k); }
  return { bad };
}

// ============================================================================
//  Admin two-factor authentication (TOTP / RFC 6238) — no external deps.
//  The admin password is the first factor; a 6-digit time-based code from an
//  authenticator app (Google Authenticator / Authy / 1Password ...) is the
//  second. The shared secret is persisted server-side (data file) so it
//  survives restarts, and can be pinned via the ADMIN_2FA_SECRET env var.
// ============================================================================
const ADMIN_2FA_ISSUER = process.env.ADMIN_2FA_ISSUER || 'Apex Admin';
const TWOFA_FILE = join(__dirname, 'data', 'apex-admin-2fa.json');
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]; bits += 8;
    while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = B32_ALPHABET.indexOf(clean[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
// HOTP (RFC 4226) for an 8-byte counter.
function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  // write counter as 64-bit big-endian (safe for the TOTP time range)
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', secretBuf).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16)
            | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
  return (bin % 1000000).toString().padStart(6, '0');
}
// Verify a TOTP code with a +/- 1 step tolerance (clock skew).
function totpVerify(secretB32, code, step = 30, window = 2) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return false;
  const secret = base32Decode(secretB32);
  if (!secret.length) return false;
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, counter + w);
    // constant-time compare
    const a = Buffer.from(expected), b = Buffer.from(c);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}
function generateTotpSecret() { return base32Encode(randomBytes(20)); }
function otpauthUri(secret, label) {
  const iss = encodeURIComponent(ADMIN_2FA_ISSUER);
  const lbl = encodeURIComponent(label || ADMIN_USER || 'admin');
  return `otpauth://totp/${iss}:${lbl}?secret=${secret}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`;
}
// Persisted 2FA state: { secret, enabled, updatedAt }.
function loadTwoFa() {
  if (process.env.ADMIN_2FA_SECRET) {
    return { secret: process.env.ADMIN_2FA_SECRET, enabled: true, env: true };
  }
  try {
    if (existsSync(TWOFA_FILE)) {
      const d = JSON.parse(readFileSync(TWOFA_FILE, 'utf8'));
      return { secret: d.secret || '', enabled: !!d.enabled, updatedAt: d.updatedAt || 0 };
    }
  } catch (e) { /* ignore */ }
  return { secret: '', enabled: false };
}
const twoFa = loadTwoFa();
function saveTwoFa() {
  if (twoFa.env) return; // pinned via env; nothing to persist
  try {
    mkdirSync(dirname(TWOFA_FILE), { recursive: true });
    writeFileSync(TWOFA_FILE, JSON.stringify({ secret: twoFa.secret, enabled: twoFa.enabled, updatedAt: Date.now() }));
  } catch (e) { console.warn('[2fa] save failed', e.message); }
}
// Short-lived, single-use tokens that bridge the password step and the OTP
// step (kept in memory only; they are NOT admin sessions).
const twoFaPending = new Map(); // token -> { kind:'verify'|'setup', secret, exp }
const TWOFA_TTL = 5 * 60 * 1000;
function newPending(kind, secret) {
  const token = 'P' + randomBytes(18).toString('hex');
  twoFaPending.set(token, { kind, secret: secret || twoFa.secret, exp: Date.now() + TWOFA_TTL });
  return token;
}
function takePending(token, kind) {
  const p = twoFaPending.get(String(token || ''));
  if (!p) return null;
  twoFaPending.delete(String(token)); // single use
  if (p.kind !== kind || p.exp < Date.now()) return null;
  return p;
}
// Housekeeping: drop expired pending tokens every few minutes.
setInterval(() => { const now = Date.now(); for (const [k, v] of twoFaPending) if (v.exp < now) twoFaPending.delete(k); }, 60 * 1000).unref();


// ---- Price cache: the only thing that talks to Binance ----
const prices = new PriceCache({
  symbols: SYMBOLS,
  refreshMs: REFRESH_MS,
  alertThreshold: ALERT_THRESHOLD,
  alertSymbols: ALERT_SYMBOLS,
});
prices.on('alert', (a) => {
  const arrow = a.direction === 'up' ? '\u25B2' : '\u25BC';
  console.log(`[ALERT] ${a.symbol} ${arrow} ${a.changePct24h.toFixed(2)}% (>= ${a.threshold}%) @ ${a.price}`);
});
prices.on('error', (e) => console.warn('[priceCache]', e.message));
prices.start();

// ---- Full market cache: the ONLY thing that pulls the full Binance list ----
const markets = new MarketCache({ refreshMs: REFRESH_MS });
markets.start();

// ---- Connection watchdog: auto-recover, and let the process manager restart
// us if the data feed stays dead. "Stale" = no fresh price for a while -> we
// force an immediate refresh to self-heal. "Dead" = still nothing after the
// hard limit -> exit(1) so PM2/systemd restarts us from a clean state.
const WATCH_STALE_MS = Number(process.env.WATCH_STALE_MS || 45000);
const WATCH_DEAD_MS = Number(process.env.WATCH_DEAD_MS || 180000);
function _lastPriceTs() { let m = 0; for (const e of prices.getAll()) if (e && e.updatedAt > m) m = e.updatedAt; return m; }
let _deadSince = 0;
setInterval(() => {
  const now = Date.now();
  const last = _lastPriceTs();
  const age = last ? now - last : Infinity;
  if (age > WATCH_STALE_MS) {
    prices.refresh().catch(() => {});   // self-heal: force a refresh
    markets.refresh().catch(() => {});
    if (!_deadSince) _deadSince = now;
    const deadFor = now - _deadSince;
    console.warn(`[watchdog] data stale ${Math.round(age / 1000)}s (dead ${Math.round(deadFor / 1000)}s), active source: ${getActiveSource()}`);
    if (deadFor > WATCH_DEAD_MS) {
      console.error('[watchdog] data feed dead past hard limit -> exiting for auto-restart');
      process.exit(1); // PM2 / systemd brings the process back up
    }
  } else {
    _deadSince = 0; // healthy again
  }
}, 15000).unref();

// ---- Portfolio (in-memory demo store) ----
const portfolios = new PortfolioStore(prices);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // needed for correct client IPs behind a proxy
// NOTE: CSP is disabled here because the existing frontend pages use inline
// <script> tags, which a strict Content-Security-Policy would block. All other
// helmet protections (HSTS, noSniff, frameguard, etc.) stay ON.
// SECURITY: the more secure long-term fix is to move inline scripts into
// external .js files and re-enable a strict CSP (see README).
app.use(helmet({ contentSecurityPolicy: false }));
// Body parsing: most endpoints only exchange tiny JSON payloads (10kb is
// plenty and limits abuse). Registration is the exception — it carries a
// base64 identity-document image — so that ONE route gets a larger limit.
const bigJson = express.json({ limit: '3mb' });
const smallJson = express.json({ limit: '10kb' });
app.use((req, res, next) => {
  if (req.path === '/api/auth/register' || req.path === '/api/auth/reverify') return bigJson(req, res, next);
  return smallJson(req, res, next);
});
app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
}));


// ---- Rate limiting (anti API-abuse) ----
// Global limiter for the whole API.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  // A live trading page polls ticker + order book (~1/s each) + candles
  // (~0.5/s), i.e. ~150 req/min for ONE active user. 120 was too low and
  // would rate-limit a legit trader, so we allow 600/min (10/s) per IP.
  // This still blocks abuse while the server itself only hits Binance once
  // per cache window no matter how many users are online.
  max: Number(process.env.RATE_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Rate limit exceeded. Try again soon.' },
});
// Stricter limiter for write/sensitive endpoints.
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Rate limit exceeded.' },
});
app.use('/api/', apiLimiter);

// ---- Public price endpoints (served from OUR cache) ----
app.get('/api/prices', (req, res) => {
  res.json({ source: 'apex-server-cache', updatedAt: Date.now(), data: prices.getAll() });
});

app.get('/api/prices/:symbol', (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  const entry = prices.get(symbol);
  if (!entry) return res.status(404).json({ error: 'not_found', symbol });
  res.json(entry);
});

// Full market list (all pairs), served from OUR cache. Same shape as Binance's
// /api/v3/ticker/24hr so the frontend needs only a URL change.
app.get('/api/markets', (req, res) => {
  res.json(markets.getAll());
});

// ---- Trading-page proxies (order book / candles / ticker / symbol info) ----
// All served from OUR server via a TTL + request-coalescing cache, so the
// trading page never talks to Binance directly.
const bproxy = new BinanceProxy();

// ---- محرّك APX المركزي: السيرفر وحده يحرّك السعر/الشموع → كل الحسابات تشوف نفس الحركة ----
let _apxBtcLast = null, _apxBtcStep = 0;
async function _apxSampleBtc() {
  try {
    const t = await bproxy.get('/api/v3/ticker/24hr', { symbol: 'BTCUSDT' }, 2500);
    const p = parseFloat(t && (t.lastPrice != null ? t.lastPrice : t.c));
    if (p > 0) {
      if (_apxBtcLast != null && _apxBtcLast > 0) {
        let d = p / _apxBtcLast - 1;
        if (d > 0.01) d = 0.01; if (d < -0.01) d = -0.01;
        _apxBtcStep = d;
      }
      _apxBtcLast = p;
    }
  } catch (e) { /* تجاهل — نكمل بضجيج صغير */ }
}
_apxSampleBtc();
setInterval(_apxSampleBtc, 3000).unref();
// خطوة كل 3 ثوانٍ: نمرّر سعر BTC اللحظي → APX يتبع BTC تراكمياً بلا توقف (حركة هادئة مثل BTC)
setInterval(() => {
  try {
    if (_apxBtcLast != null && _apxBtcLast > 0) apx.tick({ price: _apxBtcLast });
    else apx.tick((Math.random() - 0.5) * 0.0006);
  } catch (e) { /* ignore */ }
}, 3000).unref();
// تدفئة شموع BTC للفواصل الشائعة → شارت APX يأخذ نفس شكل BTC ونفس التناسق الزمني
const _APX_IVS = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'];
async function _apxWarmBtcKl() {
  for (const iv of _APX_IVS) {
    try {
      const a = await bproxy.get('/api/v3/klines', { symbol: 'BTCUSDT', interval: iv, limit: 1000 }, 60000);
      if (Array.isArray(a) && a.length) _apxBtcKl[iv] = a;
    } catch (e) { /* تجاهل — يُستخدم بديل تركيبي */ }
  }
}
_apxWarmBtcKl();
setInterval(_apxWarmBtcKl, 2 * 60 * 1000).unref();
const VALID_SYMBOL = /^[A-Z0-9]{4,20}$/;
const VALID_INTERVAL = new Set([
  '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h',
  '1d', '3d', '1w', '1M',
]);

// 24h ticker for one symbol. Prefer the full-market cache (zero extra upstream
// cost); fall back to a short-TTL proxy for pairs not in that list.
app.get('/api/ticker', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) return res.status(400).json({ error: 'bad_symbol' });
  const cached = markets.getAll().find((t) => t.symbol === symbol);
  if (cached) return res.json(cached);
  try {
    res.json(await bproxy.get('/api/v3/ticker/24hr', { symbol }, 2000));
  } catch (e) {
    res.status(502).json({ error: 'upstream_unavailable' });
  }
});

// Order book depth (refreshed ~1s upstream, shared by all users).
app.get('/api/depth', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) return res.status(400).json({ error: 'bad_symbol' });
  let limit = Number(req.query.limit) || 20;
  limit = Math.min(100, Math.max(5, limit));
  try {
    res.json(await bproxy.get('/api/v3/depth', { symbol, limit }, 1000));
  } catch (e) {
    res.status(502).json({ error: 'upstream_unavailable' });
  }
});

// Candlesticks. A big history load is cached longer; the live tail (limit<=2)
// is cached briefly so candles still update quickly.
app.get('/api/klines', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) return res.status(400).json({ error: 'bad_symbol' });
  const interval = String(req.query.interval || '1m');
  if (!VALID_INTERVAL.has(interval)) return res.status(400).json({ error: 'bad_interval' });
  let limit = Number(req.query.limit) || 300;
  limit = Math.min(500, Math.max(1, limit));
  const ttl = limit <= 2 ? 1500 : 4000;
  try {
    res.json(await bproxy.get('/api/v3/klines', { symbol, interval, limit }, ttl));
  } catch (e) {
    res.status(502).json({ error: 'upstream_unavailable' });
  }
});

// Symbol metadata (tick size / lot size). Rarely changes -> long TTL.
app.get('/api/exchangeInfo', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) return res.status(400).json({ error: 'bad_symbol' });
  try {
    res.json(await bproxy.get('/api/v3/exchangeInfo', { symbol }, 3600000));
  } catch (e) {
    res.status(502).json({ error: 'upstream_unavailable' });
  }
});

app.get('/api/alerts', (req, res) => {
  res.json({ threshold: ALERT_THRESHOLD, symbols: ALERT_SYMBOLS, data: prices.getAlerts() });
});

app.get('/api/health', (req, res) => {
  const now = Date.now();
  let last = 0; for (const e of prices.getAll()) if (e && e.updatedAt > last) last = e.updatedAt;
  const priceAgeMs = last ? now - last : null;
  const marketAgeMs = markets.updatedAt ? now - markets.updatedAt : null;
  const ok = priceAgeMs != null && priceAgeMs < 60000;
  res.status(ok ? 200 : 503).json({
    ok,
    source: getActiveSource(),
    symbols: SYMBOLS,
    cachedPrices: prices.getAll().length,
    cachedMarkets: markets.getAll().length,
    priceAgeMs,
    marketAgeMs,
    uptimeSec: Math.round(process.uptime()),
    at: now,
  });
});

// ---- Wallet endpoints (DEMO ONLY) ----
// NOTE: These demo endpoints have NO authentication. Do NOT expose them to real
// users as-is. In production, put them behind login + per-user authorization,
// move storage to a real database, and add an audit log.
app.get('/api/wallet/:userId', (req, res, next) => {
  // 'me' and 'futures' are served by the AUTHENTICATED routes defined further
  // below. This ':userId' route is registered first, so without this guard it
  // would capture GET /api/wallet/me and GET /api/wallet/futures (userId ===
  // 'me' / 'futures') and return an always-zero demo portfolio -- which is
  // exactly why the futures balance flashed after a transfer then reset to
  // zero (the money was safe on the server, but this route shadowed the read).
  if (req.params.userId === 'me' || req.params.userId === 'futures') return next();
  const userId = String(req.params.userId);
  portfolios.createAccount(userId); // new accounts start at zero balance
  res.json(portfolios.summary(userId));
});

// Demo helper to simulate a real buy (holding with a real cost basis).
app.post('/api/wallet/:userId/buy', strictLimiter, (req, res) => {
  const userId = String(req.params.userId);
  const { symbol, amount, unitCost } = req.body || {};
  if (!symbol || !(amount > 0) || !(unitCost > 0)) {
    return res.status(400).json({ error: 'bad_request' });
  }
  portfolios.addHolding(userId, String(symbol).toUpperCase(), Number(amount), Number(unitCost));
  res.json(portfolios.summary(userId));
});

// ============================================================
//  AUTH + ADMIN + SUPPORT CHAT  (demo backend)
// ------------------------------------------------------------
//  SECURITY NOTE: passwords are hashed (scrypt) and sessions use
//  random bearer tokens, but this is still DEMO-grade: single JSON
//  file storage, no email verification, no CSRF tokens, admin guarded
//  only by a shared username/password. For production add HTTPS, a
//  real DB, email/2FA verification, and stronger admin auth.
// ============================================================

function bearer(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// User auth guard — verifies the signed session token and loads the user
// from MySQL (source of truth for identity + status). Balances / deposits are
// merged from the JSON store ledger, keyed by the SAME user id (as a string).
async function requireUser(req, res, next) {
  try {
    const uid = verifyUserToken(bearer(req));
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const dbu = await dbGetUserById(uid);
    if (!dbu) return res.status(401).json({ error: 'unauthorized' });
    if (dbu.status === 'banned') return res.status(403).json({ error: 'banned' });
    let su = null;
    try { su = store.findUserById(String(dbu.id)); } catch (e) { /* store may not have this user */ }
    req.user = {
      id: String(dbu.id), uid: dbu.id,
      name: dbu.name || dbu.username || dbu.email,
      username: dbu.username || dbu.name || dbu.email,
      email: dbu.email,
      status: dbu.status || 'pending',
      country: dbu.country || '',
      balances: (su && su.balances) ? su.balances : {},
      depositAddress: (su && su.depositAddress) ? su.depositAddress : '',
      lastSeen: (su && su.lastSeen) ? su.lastSeen : 0,
    };
    // keep the "last active" marker fresh for the admin online indicator
    try { pool.query('UPDATE users SET last_seen = ? WHERE id = ?', [Date.now(), dbu.id]); } catch (e) {}
    next();
  } catch (e) {
    console.error('requireUser error:', e.message);
    res.status(500).json({ error: 'auth_failed' });
  }
}

// Admin auth guard
function requireAdmin(req, res, next) {
  if (!store.isAdminToken(bearer(req))) return res.status(401).json({ error: 'unauthorized' });
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_DOC_TYPES = new Set(['national_id', 'passport', 'driver_license']);
// Accepts a base64 image data URL (jpeg/png/webp). Returns it if valid & small.
function validIdImage(v) {
  if (typeof v !== 'string') return '';
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return '';
  if (v.length > 2800000) return ''; // ~2MB after base64 overhead
  return v;
}

// ---- Registration: creates a PENDING request for admin review ----

// ---- Login ----
// Users can log in as soon as they register. Their KYC status (pending /
// approved / rejected) is returned so the app can show the right state
// ("under review" banner, verified badge, or a re-verify prompt). Only
// BANNED accounts are refused entry.
app.post('/api/auth/login', strictLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'invalid_credentials' });
    }

    // 1. البحث عن المستخدم في MySQL (مصدر الحقيقة للهوية والحالة)
    const user = await dbGetUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // 2. التحقق من كلمة المرور (مع ترقية الكلمات القديمة غير المشفّرة)
    const vr = verifyPassword(password, user.password);
    if (!vr.ok) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    if (vr.legacy) {
      try { await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashPassword(password), user.id]); }
      catch (e) { console.warn('[login] password upgrade failed:', e.message); }
    }

    // 3. الحسابات المحظورة ممنوعة من الدخول
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'banned' });
    }

    // 4. نجاح الدخول: أصدر توكناً موقّعاً حقيقياً، وأعد الحالة الفعلية
    //    من قاعدة البيانات (لا توثيق تلقائي بعد الآن).
    try { await pool.query('UPDATE users SET last_seen = ? WHERE id = ?', [Date.now(), user.id]); } catch (e) {}
    const token = signUserToken(user.id);
    res.json({ ok: true, token, status: user.status || 'pending', user: dbPublicUser(user) });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});


// ---- Re-verify (user resubmits identity document after a rejection) ----
// A logged-in user uploads a new document; their account goes back to
// 'pending' for another admin review. Carries a base64 image, so this route
// also gets the larger JSON body limit (see the body-parser switch above).
app.post('/api/auth/reverify', strictLimiter, requireUser, async (req, res) => {
  try {
    const { idDocType, idImage } = req.body || {};
    if (!ID_DOC_TYPES.has(String(idDocType || ''))) return res.status(400).json({ error: 'bad_id_type' });
    const img = validIdImage(idImage);
    if (!img) return res.status(400).json({ error: 'bad_id_image' });
    // احفظ الوثيقة الجديدة وأعد الحساب لـ pending لمراجعة الأدمن
    await pool.query(
      'INSERT INTO id_documents (user_id, doc_type, image) VALUES (?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE doc_type = VALUES(doc_type), image = VALUES(image), created_at = CURRENT_TIMESTAMP',
      [req.user.uid, String(idDocType), img]);
    await pool.query('UPDATE users SET status = ?, reject_reason = NULL WHERE id = ?', ['pending', req.user.uid]);
    try { store.setIdDoc(req.user.id, idDocType, img); } catch (e) {}
    const u = await dbGetUserById(req.user.uid);
    res.json({ ok: true, status: 'pending', user: dbPublicUser(u) });
  } catch (err) {
    console.error('Reverify Error:', err);
    res.status(500).json({ error: 'reverify_failed' });
  }
});

// ---- Live presence heartbeat (user side) ----
// IMPORTANT: this endpoint NO LONGER overwrites balances. Earlier it accepted
// the client's full wallet and REPLACED the server balances, which let a stale
// or empty local wallet wipe real balances (including admin credits). Balances
// are now server-authoritative: admin credits (addDeposit), transfers
// (debit/credit) and trades (applyDeltas) mutate them. This route only marks
// the account as recently active so the admin "online" flag stays accurate
// while the user is simply browsing. It returns the authoritative balances so
// the client can mirror them.
app.post('/api/wallet/sync', requireUser, (req, res) => {
  store.touchSeen(req.user.id);
  res.json({ ok: true, balances: req.user.balances || {} });
});

// ---- Apply a trade delta (server is the source of truth) ----
// The client sends signed per-currency changes for an executed trade/fill/
// cancel, e.g. { deltas: { USDT: -50.25, BTC: 0.001 } }. The server applies
// them additively and atomically and returns the new balances. Rejected with
// 400 if any balance would go negative. This keeps balances consistent with
// admin credits that may have arrived concurrently (they are preserved).
app.post('/api/wallet/apply', requireUser, (req, res) => {
  const deltas = (req.body || {}).deltas || {};
  const chk = inspectDeltas(deltas);
  if (chk.bad.length) {
    logSecurity(req, { kind: 'invalid_delta', severity: 'warning', detail: 'قيم غير صالحة (NaN/∐) في طلب تعديل الرصيد: ' + chk.bad.join(', '), meta: { deltas } });
  }
  const u = store.applyDeltas(req.user.id, deltas);
  if (!u) {
    logSecurity(req, { kind: 'below_zero_apply', severity: 'critical', detail: 'محاولة خصم تتجاوز الرصيد المتاح (خلق مال — رُفضت) عبر /api/wallet/apply', meta: { deltas, balances: req.user.balances || {} } });
    return res.status(400).json({ error: 'insufficient_balance' });
  }
  // Guard against draining funds that are LOCKED by open orders. If any
  // resulting balance drops below what open orders still hold, undo and reject.
  const lk = lockedBalances(req.user.id);
  for (const c in lk) {
    if ((Number((u.balances || {})[c]) || 0) + 1e-9 < lk[c]) {
      // revert the just-applied deltas
      const undo = {};
      for (const k in deltas) undo[k] = -Number(deltas[k]);
      store.applyDeltas(req.user.id, undo);
      logSecurity(req, { kind: 'spend_locked', severity: 'critical', detail: 'محاولة التصرّف برصيد محجوز لأمر مفتوح (رُفضت)', meta: { deltas, locked: lk } });
      return res.status(400).json({ error: 'insufficient_balance' });
    }
  }
  res.json({ ok: true, balances: u.balances || {}, locked: lk });
});

// ---- Record a trading fee into the platform commission account ----
// Called by the trading / futures pages right after a trade executes. The fee
// has ALREADY been deducted from the user's balance (via /api/wallet/apply or
// the local wallet); this endpoint only moves that amount into the platform's
// commission ledger so the admin panel can show total revenue separately from
// user funds. DEMO NOTE: the client reports the amount, so in production you
// should compute the fee server-side (inside /api/wallet/apply) instead of
// trusting the client.
app.post('/api/wallet/fee', requireUser, (req, res) => {
  const { amount, currency, source } = req.body || {};
  const total = recordCommission({
    amount, currency, userId: req.user.id, userName: req.user.name || '', source,
  });
  if (total == null) {
    logSecurity(req, { kind: 'bad_fee', severity: 'warning', detail: 'رسوم مُبلّغة من المتصفّح غير صالحة', meta: { amount, currency } });
    return res.status(400).json({ error: 'bad_fee' });
  }
  res.json({ ok: true, total });
});

// ============================================================
//  SERVER-SIDE LIMIT ORDER BOOK (pending orders)
// ------------------------------------------------------------
//  Pending limit orders now live HERE on the server, keyed per
//  user, NOT in the browser. This fixes two classes of bugs:
//   (1) orders leaking across accounts on a shared browser, and
//   (2) money created from nothing when cancelling an order that
//       was never actually deducted.
//  Rules enforced on the server:
//   - placing a pending order deducts NOTHING,
//   - cancelling refunds NOTHING,
//   - only on execution do we deduct + convert + take the fee,
//     atomically through store.applyDeltas (which rejects any
//     balance going below zero), so money can NEVER be created.
//  The trade fee is computed HERE on the server (not reported by
//  the client), so it cannot be tampered with.
// ============================================================
const SPOT_FEE_RATE = Number(process.env.SPOT_FEE_RATE || 0.001); // 0.10% like Binance spot
const ORDERS_FILE = join(__dirname, 'data', 'apex-orders.json');
function loadOrders() {
  try {
    if (existsSync(ORDERS_FILE)) {
      const d = JSON.parse(readFileSync(ORDERS_FILE, 'utf8'));
      if (Array.isArray(d)) return d;
      if (d && Array.isArray(d.orders)) return d.orders;
    }
  } catch (e) { /* ignore corrupt / missing file */ }
  return [];
}
let orders = loadOrders();
function saveOrders() {
  try {
    mkdirSync(dirname(ORDERS_FILE), { recursive: true });
    writeFileSync(ORDERS_FILE, JSON.stringify(orders));
  } catch (e) { console.warn('[orders] save failed:', e.message); }
}
const CCY_RE = /^[A-Z0-9]{2,12}$/;
function newOrderId() {
  return 'o_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function publicOrder(o) {
  return {
    id: o.id, sym: o.sym, b: o.base, qc: o.quote, side: o.side,
    p: o.price, q: o.qty, status: o.status, t: o.createdAt,
    type: o.type || 'limit', tp: o.tp || 0, sl: o.sl || 0,
  };
}

// ---- LOCKED (held) balances -------------------------------------------
// A pending order does NOT remove money from the wallet. Instead the amount
// stays in the balance but is "locked": it still shows in the wallet total,
// yet it cannot be spent anywhere until the order is filled or cancelled.
// We derive the locked amount per currency from the reserves of all OPEN
// orders (the single source of truth), so nothing can drift out of sync.
function lockedBalances(userId) {
  const out = {};
  for (const o of orders) {
    if (o.userId !== userId || o.status !== 'open') continue;
    if (!o.reserve || !(o.reserve.amount > 0)) continue;
    const c = o.reserve.ccy;
    out[c] = +(((out[c] || 0) + o.reserve.amount)).toFixed(8);
  }
  return out;
}
// Spendable balance = wallet balance - locked (held by open orders).
function availableBalance(userId, ccy, locked) {
  const u = store.findUserById(userId);
  const bal = Number((u && u.balances || {})[ccy]) || 0;
  const lk = (locked || lockedBalances(userId))[ccy] || 0;
  return bal - lk;
}

// Place a pending order. The funds are LOCKED, not withdrawn:
//  - limit buy : locks quote = price*qty*(1+fee)
//  - limit sell / TP-SL : locks base = qty
// The money STAYS in the wallet balance (still shown in the total), it just
// becomes un-spendable until the order fills or is cancelled. We never debit
// here; we only verify that enough SPENDABLE balance (balance - already
// locked) exists, then record the lock on the order. On fill the money is
// finally moved; on cancel the lock simply disappears. Nothing is ever
// created from nothing. type='tpsl' is a conditional SELL watched by the
// matching loop and triggered by tp (take-profit) / sl (stop-loss).
app.post('/api/orders', requireUser, (req, res) => {
  const b = req.body || {};
  const sym = String(b.sym || '').toUpperCase();
  const base = String(b.base || '').toUpperCase();
  const quote = String(b.quote || 'USDT').toUpperCase();
  let side = b.side === 'sell' ? 'sell' : 'buy';
  const type = b.type === 'tpsl' ? 'tpsl' : 'limit';
  const price = Number(b.price);
  const qty = Number(b.qty);
  const tp = Number(b.tp) || 0;
  const sl = Number(b.sl) || 0;
  if (!VALID_SYMBOL.test(sym)) return res.status(400).json({ error: 'bad_symbol' });
  if (!CCY_RE.test(base) || !CCY_RE.test(quote)) return res.status(400).json({ error: 'bad_currency' });
  if (sym !== base + quote) return res.status(400).json({ error: 'symbol_mismatch' });
  if (!(qty > 0) || !isFinite(qty)) return res.status(400).json({ error: 'bad_qty' });
  if (type === 'tpsl') {
    side = 'sell'; // TP/SL always protects a held base position by selling
    if (!((tp > 0) || (sl > 0))) return res.status(400).json({ error: 'bad_trigger' });
    const refPx = priceOf(sym) || 0;
    if (refPx > 0 && refPx * qty > 1e12) return res.status(400).json({ error: 'too_large' });
  } else {
    if (!(price > 0) || !isFinite(price)) return res.status(400).json({ error: 'bad_price' });
    if (price * qty > 1e12) return res.status(400).json({ error: 'too_large' }); // anti-abuse cap
  }
  const openMine = orders.filter((o) => o.userId === req.user.id && o.status === 'open');
  if (openMine.length >= 100) return res.status(400).json({ error: 'too_many_open_orders' });

  // ---- LOCK (hold) the funds WITHOUT withdrawing them ----
  let reserve;
  if (type === 'limit' && side === 'buy') {
    const hold = price * qty * (1 + SPOT_FEE_RATE);
    reserve = { ccy: quote, amount: +hold.toFixed(8) };
  } else {
    reserve = { ccy: base, amount: +qty.toFixed(8) };
  }
  // Spendable = balance - already-locked. Must cover this new lock.
  const avail = availableBalance(req.user.id, reserve.ccy);
  if (avail + 1e-9 < reserve.amount) {
    logSecurity(req, { kind: 'lock_below_available', severity: 'warning', detail: '\u0645\u062d\u0627\u0648\u0644\u0629 \u062d\u062c\u0632 \u0645\u0628\u0644\u063a \u064a\u062a\u062c\u0627\u0648\u0632 \u0627\u0644\u0631\u0635\u064a\u062f \u0627\u0644\u0645\u062a\u0627\u062d (\u0631\u064f\u0641\u0636\u062a)', meta: { sym, side, type, qty, price, reserve, avail } });
    return res.status(400).json({ error: 'insufficient_balance' });
  }
  const order = {
    id: newOrderId(), userId: req.user.id, sym, base, quote, side,
    price: type === 'limit' ? price : 0, qty, status: 'open',
    createdAt: Date.now(), filledAt: 0, type, tp, sl, reserve,
  };
  orders.unshift(order);
  saveOrders();
  const u = store.findUserById(req.user.id) || {};
  res.json({ ok: true, order: publicOrder(order), balances: u.balances || {}, locked: lockedBalances(req.user.id) });
});

// List MY open orders.
app.get('/api/orders', requireUser, (req, res) => {
  const mine = orders
    .filter((o) => o.userId === req.user.id && o.status === 'open')
    .map(publicOrder);
  res.json({ ok: true, orders: mine });
});

// Cancel one of MY open orders. The lock simply disappears (nothing was
// withdrawn), so the full amount becomes spendable again instantly.
app.post('/api/orders/:id/cancel', requireUser, (req, res) => {
  const id = String(req.params.id);
  const o = orders.find((x) => x.id === id && x.userId === req.user.id);
  if (!o) return res.status(404).json({ error: 'not_found' });
  if (o.status !== 'open') return res.status(400).json({ error: 'not_open' });
  o.status = 'canceled';
  o.canceledAt = Date.now();
  saveOrders();
  const u = store.findUserById(req.user.id) || {};
  res.json({ ok: true, balances: u.balances || {}, locked: lockedBalances(req.user.id) });
});

// ---- Market order: executes IMMEDIATELY on the server ----
// Unlike a pending limit order, a market order fills right now at OUR current
// server-side price. Everything money-related happens HERE on the server:
//   - the fill price comes from OUR price cache (priceOf), never the client,
//   - the fee is computed server-side (SPOT_FEE_RATE) -> tamper-proof,
//   - deduct + convert + fee are applied atomically via store.applyDeltas,
//     which REJECTS any balance going below zero (money can't be created).
// The client sends only { sym, base, quote, side, qty }; it does NOT get to
// pick the price or the fee. Returns the executed fill + authoritative balances.
app.post('/api/orders/market', requireUser, (req, res) => {
  const b = req.body || {};
  const sym = String(b.sym || '').toUpperCase();
  const base = String(b.base || '').toUpperCase();
  const quote = String(b.quote || 'USDT').toUpperCase();
  const side = b.side === 'sell' ? 'sell' : 'buy';
  const qty = Number(b.qty);
  if (!VALID_SYMBOL.test(sym)) return res.status(400).json({ error: 'bad_symbol' });
  if (!CCY_RE.test(base) || !CCY_RE.test(quote)) return res.status(400).json({ error: 'bad_currency' });
  if (sym !== base + quote) {
    logSecurity(req, { kind: 'symbol_mismatch', severity: 'warning', detail: 'طلب أمر سوق بزوج لا يطابق العملة الأساس/المقتبسة', meta: { sym, base, quote } });
    return res.status(400).json({ error: 'symbol_mismatch' });
  }
  if (!(qty > 0) || !isFinite(qty)) return res.status(400).json({ error: 'bad_qty' });
  const px = priceOf(sym); // OUR price, not the client's
  if (!(px > 0)) return res.status(503).json({ error: 'no_price' });
  const val = px * qty;
  if (val > 1e12) {
    logSecurity(req, { kind: 'oversize_order', severity: 'warning', detail: 'محاولة أمر سوق بقيمة تتجاوز الحد الأقصى (منع إساءة)', meta: { sym, qty, px, val } });
    return res.status(400).json({ error: 'too_large' }); // anti-abuse cap
  }
  const fee = val * SPOT_FEE_RATE; // fee computed server-side
  // A market order may only spend what is SPENDABLE (balance - locked by open
  // orders). This prevents a market trade from eating funds that are held for
  // a pending/TP-SL order.
  const spendCcy = side === 'buy' ? quote : base;
  const spendAmt = side === 'buy' ? (val + fee) : qty;
  if (availableBalance(req.user.id, spendCcy) + 1e-9 < spendAmt) {
    logSecurity(req, { kind: 'market_over_available', severity: 'warning', detail: '\u0645\u062d\u0627\u0648\u0644\u0629 \u0623\u0645\u0631 \u0633\u0648\u0642 \u064a\u062a\u062c\u0627\u0648\u0632 \u0627\u0644\u0631\u0635\u064a\u062f \u0627\u0644\u0645\u062a\u0627\u062d (\u062c\u0632\u0621 \u0645\u062d\u062c\u0648\u0632 \u0644\u0623\u0645\u0631 \u0622\u062e\u0631)', meta: { sym, side, qty, px, spendCcy, spendAmt } });
    return res.status(400).json({ error: 'insufficient_balance' });
  }
  const deltas = side === 'buy'
    ? { [quote]: -(val + fee), [base]: qty }
    : { [base]: -qty, [quote]: (val - fee) };
  const u = store.applyDeltas(req.user.id, deltas);
  if (!u) {
    logSecurity(req, { kind: 'below_zero_market', severity: 'critical', detail: 'محاولة تنفيذ أمر سوق بقيمة تتجاوز الرصيد (خلق مال — رُفضت)', meta: { sym, side, qty, px, val, fee } });
    return res.status(400).json({ error: 'insufficient_balance' });
  }
  const user = req.user;
  recordCommission({ amount: fee, currency: quote, userId: user.id, userName: user.name || '', source: 'spot' });
  store.addTransaction(user.id, {
    type: side === 'buy' ? 'order_buy' : 'order_sell',
    amount: qty, currency: base,
    counterparty: base + '/' + quote,
    note: '\u062a\u0646\u0641\u064a\u0630 \u0623\u0645\u0631 \u0633\u0648\u0642 @ ' + px + ' ' + quote,
  });
  store.addNotification(user.id, {
    title: '\u062a\u0645 \u062a\u0646\u0641\u064a\u0630 \u0623\u0645\u0631\u0643',
    body: (side === 'buy' ? '\u0634\u0631\u0627\u0621' : '\u0628\u064a\u0639') + ' ' + qty + ' ' + base + ' @ ' + px + ' ' + quote + ' (\u0633\u0648\u0642).',
  });
  res.json({ ok: true, exec: { price: px, qty, val, fee, side, base, quote }, balances: u.balances || {}, locked: lockedBalances(req.user.id) });
});

// ---- Matching engine: fills pending orders when OUR price reaches them ----
// Runs on the server every 2s.
//  - limit orders trigger when OUR price crosses the limit price,
//  - TP/SL orders trigger when OUR price hits tp (>=) or sl (<=) and fill at
//    the current market price,
//  - funds were already HELD (reserved) at placement, so a fill only CREDITS
//    the opposite leg; the held leg is consumed. Money can never be created
//    because the hold itself went through store.applyDeltas.
function matchOrders() {
  let changed = false;
  for (const o of orders) {
    if (o.status !== 'open') continue;
    const px = priceOf(o.sym);
    if (!(px > 0)) continue;
    let hit, execPx;
    if (o.type === 'tpsl') {
      const tpHit = o.tp > 0 && px >= o.tp;   // take-profit reached
      const slHit = o.sl > 0 && px <= o.sl;   // stop-loss reached
      hit = tpHit || slHit;
      execPx = px; // conditional orders fill at the current market price
    } else {
      hit = o.side === 'buy' ? px <= o.price : px >= o.price;
      execPx = o.price; // limit price (client UX parity)
    }
    if (!hit) continue;
    const val = execPx * o.qty;
    const fee = val * SPOT_FEE_RATE; // fee computed server-side -> tamper-proof
    // Debit the real money now (the lock was virtual). Atomic + rejects
    // negatives. The locked amount was kept un-spendable everywhere else, so
    // the balance is guaranteed to cover the fill.
    const deltas = o.side === 'buy'
      ? { [o.quote]: -(val + fee), [o.base]: o.qty }
      : { [o.base]: -o.qty, [o.quote]: (val - fee) };
    const u = store.applyDeltas(o.userId, deltas);
    if (!u) {
      o.status = 'canceled';
      o.canceledAt = Date.now();
      o.cancelReason = 'insufficient_balance';
      logSecurityEvent({
        user: store.findUserById(o.userId) || { id: o.userId },
        ip: 'server(engine)', path: 'matchOrders', kind: 'order_fill_below_zero', severity: 'warning',
        detail: '\u0623\u064f\u0644\u063a\u064a \u0623\u0645\u0631 \u0645\u0639\u0644\u0651\u0642 \u0639\u0646\u062f \u0627\u0644\u062a\u0646\u0641\u064a\u0630 \u0644\u0639\u062f\u0645 \u0643\u0641\u0627\u064a\u0629 \u0627\u0644\u0631\u0635\u064a\u062f \u0644\u062d\u0638\u0629 \u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629',
        meta: { orderId: o.id, sym: o.sym, side: o.side, qty: o.qty, execPx, deltas },
      });
      store.addNotification(o.userId, {
        title: '\u062a\u0639\u0630\u0651\u0631 \u062a\u0646\u0641\u064a\u0630 \u0623\u0645\u0631',
        body: '\u0623\u064f\u0644\u063a\u064a \u0623\u0645\u0631\u0643 \u0639\u0644\u0649 ' + o.base + '/' + o.quote + ' \u0644\u0639\u062f\u0645 \u0643\u0641\u0627\u064a\u0629 \u0627\u0644\u0631\u0635\u064a\u062f \u0644\u062d\u0638\u0629 \u0627\u0644\u062a\u0646\u0641\u064a\u0630.',
      });
      changed = true;
      continue;
    }
    o.status = 'filled';
    o.filledAt = Date.now();
    o.execPrice = execPx;
    const user = store.findUserById(o.userId) || {};
    recordCommission({ amount: fee, currency: o.quote, userId: o.userId, userName: user.name || '', source: 'spot' });
    store.addTransaction(o.userId, {
      type: o.side === 'buy' ? 'order_buy' : 'order_sell',
      amount: o.qty, currency: o.base,
      counterparty: o.base + '/' + o.quote,
      note: (o.type === 'tpsl' ? '\u062a\u0646\u0641\u064a\u0630 \u0623\u0645\u0631 TP/SL @ ' : '\u062a\u0646\u0641\u064a\u0630 \u0623\u0645\u0631 \u0645\u0639\u0644\u0651\u0642 @ ') + execPx + ' ' + o.quote,
    });
    store.addNotification(o.userId, {
      title: '\u062a\u0645 \u062a\u0646\u0641\u064a\u0630 \u0623\u0645\u0631\u0643',
      body: (o.side === 'buy' ? '\u0634\u0631\u0627\u0621' : '\u0628\u064a\u0639') + ' ' + o.qty + ' ' + o.base + ' @ ' + execPx + ' ' + o.quote + (o.type === 'tpsl' ? ' (TP/SL)' : '') + '.',
    });
    changed = true;
  }
  if (orders.length > 600) {
    const open = orders.filter((o) => o.status === 'open');
    const done = orders.filter((o) => o.status !== 'open').slice(0, 300);
    orders = open.concat(done);
    changed = true;
  }
  if (changed) saveOrders();
}
setInterval(matchOrders, 2000);

// ---- Wallet: my deposit address + incoming-deposit ledger ----
// The client credits its local wallet from any new deposits (idempotent by id)
// then re-syncs, so balances stay consistent with the admin liquidity view.
app.get('/api/wallet/me', requireUser, (req, res) => {
  res.json({
    ok: true,
    depositAddress: req.user.depositAddress || '',
    deposits: store.getDeposits(req.user.id),
    balances: req.user.balances || {},
    locked: lockedBalances(req.user.id),
  });
});

// ---- Futures wallet: read my futures balances ----
app.get('/api/wallet/futures', requireUser, (req, res) => {
  res.json({ ok: true, balances: futuresBalances(req.user.id) });
});

// ---- Futures wallet: apply a signed delta (margin lock / PnL settle) ----
// The futures trading page opens a position by locking margin+fee out of the
// FUTURES wallet, and closes it by crediting back margin +/- PnL. These moves
// touch ONLY the futures wallet (never the spot balance), so the two wallets
// stay fully separated. MONEY SAFETY: futuresApply is atomic and rejects any
// result below zero (money can never be created); rejected over-draws are
// logged to the security log just like the spot path.
app.post('/api/wallet/futures/apply', requireUser, (req, res) => {
  const deltas = (req.body || {}).deltas || {};
  const chk = inspectDeltas(deltas);
  if (chk.bad.length) {
    logSecurity(req, { kind: 'invalid_delta', severity: 'warning', detail: 'قيم غير صالحة (NaN/∞) في طلب تعديل رصيد العقود', meta: { deltas } });
  }
  const fb = futuresApply(req.user.id, deltas);
  if (!fb) {
    logSecurity(req, { kind: 'below_zero_futures', severity: 'critical', detail: 'محاولة خصم من محفظة العقود يتجاوز الرصيد (خلق مال — رُفض) عبر /api/wallet/futures/apply', meta: { deltas, balances: futuresBalances(req.user.id) } });
    return res.status(400).json({ error: 'insufficient_balance' });
  }
  res.json({ ok: true, balances: fb });
});

// ---- My transaction history (audit ledger for THIS user) ----
// Returns the user's own money movements (transfers, trades, deposits) so the
// app can show a personal history. Read-only; never mutates balances.
app.get('/api/wallet/transactions', requireUser, (req, res) => {
  let rows = [];
  try { rows = store.getTransactions(req.user.id) || []; } catch (e) { rows = []; }
  res.json({ ok: true, transactions: rows });
});

// ---- Internal transfer between Spot and Futures wallets ----
// Moves one currency between the user's own Spot balance (server-authoritative,
// store.applyDeltas / debitBalance) and their Futures wallet (futuresApply).
// MONEY SAFETY: fully atomic with rollback. We debit the SOURCE first (which
// rejects any below-zero result), then credit the DESTINATION; if the credit
// fails for any reason we roll the debit back, so no balance is ever created
// and nothing is lost. Every rejected over-draw is logged to the security log.
app.post('/api/wallet/transfer-internal', strictLimiter, requireUser, (req, res) => {
  const body = req.body || {};
  const from = String(body.from || '').toLowerCase();
  const to = String(body.to || '').toLowerCase();
  const cur = String(body.currency || '').toUpperCase();
  const amt = Number(body.amount);
  const dirs = new Set(['spot', 'futures']);
  if (!dirs.has(from) || !dirs.has(to) || from === to) return res.status(400).json({ error: 'bad_direction' });
  if (!TRANSFER_CUR.test(cur)) return res.status(400).json({ error: 'bad_currency' });
  if (!(amt > 0) || !isFinite(amt)) return res.status(400).json({ error: 'bad_amount' });

  if (from === 'spot') {
    // Spot -> Futures: debit spot (rejects over-draw), then credit futures.
    const u = store.applyDeltas(req.user.id, { [cur]: -amt });
    if (!u) {
      logSecurity(req, { kind: 'below_zero_internal', severity: 'critical', detail: 'محاولة تحويل داخلي (فوري ← عقود) يتجاوز الرصيد الفوري (خلق مال — رُفض)', meta: { from, to, currency: cur, amount: amt } });
      return res.status(400).json({ error: 'insufficient_balance' });
    }
    const fb = futuresApply(req.user.id, { [cur]: amt });
    if (!fb) {
      // credit failed -> roll the spot debit back so no money is lost
      store.applyDeltas(req.user.id, { [cur]: amt });
      return res.status(500).json({ error: 'transfer_failed' });
    }
    store.addTransaction(req.user.id, { type: 'transfer_internal', direction: 'spot_to_futures', from: 'spot', to: 'futures', amount: amt, currency: cur, note: 'تحويل من الفوري إلى العقود الآجلة' });
    return res.json({ ok: true, balances: u.balances || {}, futures: fb });
  }

  // Futures -> Spot: debit futures (rejects over-draw), then credit spot.
  const fb = futuresApply(req.user.id, { [cur]: -amt });
  if (!fb) {
    logSecurity(req, { kind: 'below_zero_internal', severity: 'critical', detail: 'محاولة تحويل داخلي (عقود ← فوري) يتجاوز رصيد العقود (خلق مال — رُفض)', meta: { from, to, currency: cur, amount: amt } });
    return res.status(400).json({ error: 'insufficient_balance' });
  }
  const u = store.applyDeltas(req.user.id, { [cur]: amt });
  if (!u) {
    // credit failed -> roll the futures debit back
    futuresApply(req.user.id, { [cur]: amt });
    return res.status(500).json({ error: 'transfer_failed' });
  }
  store.addTransaction(req.user.id, { type: 'transfer_internal', direction: 'futures_to_spot', from: 'futures', to: 'spot', amount: amt, currency: cur, note: 'تحويل من العقود الآجلة إلى الفوري' });
  return res.json({ ok: true, balances: u.balances || {}, futures: fb });
});

// ---- Transfer to another account by its deposit address ----
// DEMO model: the sender's client already deducted the amount from its local
// wallet; here we credit the RECIPIENT by recording an incoming deposit plus a
// notification. Money can only be sent to an address that maps to a real,
// non-banned account. Self-transfers are rejected.
const TRANSFER_CUR = /^[A-Z0-9]{2,12}$/;
app.post('/api/wallet/transfer', strictLimiter, requireUser, (req, res) => {
  const { toAddress, amount, currency } = req.body || {};
  const addr = String(toAddress || '').trim();
  const cur = String(currency || 'USDT').toUpperCase();
  const amt = Number(amount);
  if (!addr) return res.status(400).json({ error: 'bad_address' });
  if (!TRANSFER_CUR.test(cur)) return res.status(400).json({ error: 'bad_currency' });
  if (!(amt > 0) || !isFinite(amt)) return res.status(400).json({ error: 'bad_amount' });
  const recipient = store.getUserByAddress(addr);
  if (!recipient) return res.status(404).json({ error: 'address_not_found' });
  if (recipient.id === req.user.id) return res.status(400).json({ error: 'self_transfer' });
  if (recipient.status === 'banned') return res.status(403).json({ error: 'recipient_banned' });
  // Deduct from the sender's server-side balance first (source of truth).
  const sender = store.debitBalance(req.user.id, cur, amt);
  if (!sender) {
    logSecurity(req, { kind: 'below_zero_transfer', severity: 'critical', detail: 'محاولة تحويل مبلغ يتجاوز الرصيد (خلق مال — رُفضت)', meta: { currency: cur, amount: amt, toAddress: addr } });
    return res.status(400).json({ error: 'insufficient_balance' });
  }
  const dep = store.addDeposit(recipient.id, {
    amount: amt, currency: cur, kind: 'transfer',
    from: req.user.depositAddress || '', fromName: req.user.name || '',
    note: 'تحويل داخلي',
  });
  store.addNotification(recipient.id, {
    title: 'إيداع جديد',
    body: 'استلمت ' + amt + ' ' + cur + ' من ' + (req.user.name || 'مستخدم') + '.',
  });
  // ---- record the movement on both sides (audit ledger) ----
  store.addTransaction(req.user.id, {
    type: 'transfer_out', amount: amt, currency: cur,
    counterparty: (recipient.name || '') + ' (' + addr + ')', note: 'تحويل صادر',
  });
  store.addTransaction(recipient.id, {
    type: 'transfer_in', amount: amt, currency: cur,
    counterparty: (req.user.name || 'مستخدم') + ' (' + (req.user.depositAddress || '') + ')', note: 'تحويل وارد',
  });
  res.json({ ok: true, deposit: dep, recipientName: recipient.name || '', balances: sender.balances || {} });
});

// ---- Notifications (user side) ----
app.get('/api/notifications', requireUser, (req, res) => {
  // جرس الصفحة الرئيسية يعرض فقط إشعارات الإدارة (العروض/الرسائل التي يرسلها
  // الأدمن من لوحة التحكم عبر زر "إرسال إشعار"). إشعارات التحويلات والصفقات
  // وشحن الرصيد لا تظهر هنا إطلاقاً.
  const all = store.getNotifications(req.user.id) || [];
  const list = all.filter((n) => n && n.kind === 'admin');
  res.json({ ok: true, notifications: list, unread: list.filter((n) => !n.read).length });
});

app.post('/api/notifications/read', requireUser, (req, res) => {
  const id = (req.body || {}).id ? String((req.body || {}).id) : '';
  store.markNotifRead(req.user.id, id);
  res.json({ ok: true });
});

// ---- Support chat (user side) ----
app.get('/api/support/messages', requireUser, (req, res) => {
  store.markRead(req.user.id, 'user');
  res.json({ ok: true, messages: store.getMessages(req.user.id) });
});

app.post('/api/support/messages', strictLimiter, requireUser, (req, res) => {
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'empty' });
  const msg = store.addMessage(req.user.id, 'user', text);
  res.json({ ok: true, message: msg });
});

// ---- Admin login (step 1: password) ----
app.post('/api/admin/login', strictLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (String(username) !== ADMIN_USER || String(password) !== ADMIN_PASS) {
    logSecurity(req, { kind: 'admin_login_fail', severity: 'warning', detail: 'admin password/username rejected', meta: { username: String(username || '').slice(0, 40) } });
    return res.status(401).json({ error: 'bad_credentials' });
  }
  // Password OK. If 2FA is already enabled, require a TOTP code before issuing
  // a real admin session. Otherwise, kick off first-time enrolment.
  if (twoFa.enabled && twoFa.secret) {
    const challenge = newPending('verify');
    return res.json({ ok: true, need2fa: true, challenge });
  }
  const secret = generateTotpSecret();
  const setupToken = newPending('setup', secret);
  return res.json({
    ok: true, needSetup: true, setupToken, secret,
    otpauth: otpauthUri(secret, username), issuer: ADMIN_2FA_ISSUER, account: String(username),
  });
});

// ---- Admin login (step 2: verify TOTP for an already-enrolled admin) ----
app.post('/api/admin/login/verify', strictLimiter, (req, res) => {
  const { challenge, code } = req.body || {};
  const p = takePending(challenge, 'verify');
  if (!p) {
    logSecurity(req, { kind: 'admin_2fa_fail', severity: 'warning', detail: 'invalid/expired 2FA challenge' });
    return res.status(401).json({ error: 'bad_challenge' });
  }
  if (!totpVerify(twoFa.secret, code)) {
    logSecurity(req, { kind: 'admin_2fa_fail', severity: 'warning', detail: 'wrong 2FA code at login' });
    return res.status(401).json({ error: 'bad_code' });
  }
  const token = store.createAdminSession();
  logSecurity(req, { kind: 'admin_login_ok', severity: 'info', detail: 'admin logged in with 2FA' });
  res.json({ ok: true, token });
});

// ---- First-time 2FA enrolment: confirm the authenticator code, then enable ----
app.post('/api/admin/2fa/enable', strictLimiter, (req, res) => {
  const { setupToken, code } = req.body || {};
  const p = takePending(setupToken, 'setup');
  if (!p || !p.secret) {
    logSecurity(req, { kind: 'admin_2fa_setup_fail', severity: 'warning', detail: 'invalid/expired setup token' });
    return res.status(401).json({ error: 'bad_setup' });
  }
  if (!totpVerify(p.secret, code)) {
    // Re-issue a fresh setup token bound to the SAME secret so the user can
    // retry without rescanning the QR.
    const retry = newPending('setup', p.secret);
    return res.status(401).json({ error: 'bad_code', setupToken: retry });
  }
  twoFa.secret = p.secret;
  twoFa.enabled = true;
  saveTwoFa();
  const token = store.createAdminSession();
  logSecurity(req, { kind: 'admin_2fa_enabled', severity: 'critical', detail: 'admin two-factor authentication enabled' });
  res.json({ ok: true, token });
});

// ---- 2FA status (for the panel) ----
app.get('/api/admin/2fa/status', requireAdmin, (req, res) => {
  res.json({ ok: true, enabled: !!(twoFa.enabled && twoFa.secret), pinnedByEnv: !!twoFa.env });
});

// ---- Disable 2FA (requires a valid current code; blocked when pinned by env) ----
app.post('/api/admin/2fa/disable', requireAdmin, (req, res) => {
  if (twoFa.env) return res.status(400).json({ error: 'pinned_by_env' });
  if (!(twoFa.enabled && twoFa.secret)) return res.json({ ok: true, enabled: false });
  const { code } = req.body || {};
  if (!totpVerify(twoFa.secret, code)) {
    logSecurity(req, { kind: 'admin_2fa_disable_fail', severity: 'warning', detail: 'wrong code on 2FA disable' });
    return res.status(401).json({ error: 'bad_code' });
  }
  twoFa.enabled = false;
  twoFa.secret = '';
  saveTwoFa();
  logSecurity(req, { kind: 'admin_2fa_disabled', severity: 'critical', detail: 'admin two-factor authentication disabled' });
  res.json({ ok: true, enabled: false });
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [[tot]] = await pool.query('SELECT COUNT(*) AS n FROM users');
    const [byStatus] = await pool.query('SELECT status, COUNT(*) AS n FROM users GROUP BY status');
    const counts = { pending: 0, approved: 0, rejected: 0, banned: 0 };
    for (const r of byStatus) counts[r.status || 'pending'] = Number(r.n) || 0;
    const base = (store.stats && store.stats()) || {};
    res.json({ ok: true, stats: Object.assign({}, base, {
      users: Number(tot.n) || 0,
      totalUsers: Number(tot.n) || 0,
      total: Number(tot.n) || 0,
      pending: counts.pending,
      approved: counts.approved,
      rejected: counts.rejected,
      banned: counts.banned,
    }) });
  } catch (err) {
    console.error('stats error:', err);
    try { return res.json({ ok: true, stats: (store.stats && store.stats()) || {} }); } catch (e) {}
    res.status(500).json({ error: 'stats_failed' });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : '';
    const params = [];
    let where = '';
    if (status) { where = ' WHERE u.status = ?'; params.push(status); }

    const [rows] = await pool.query(
      'SELECT u.id, u.username, u.name, u.email, u.status, u.country, u.reject_reason, u.created_at, u.last_seen, ' +
      ' d.doc_type AS doc_type, (d.image IS NOT NULL) AS has_doc ' +
      'FROM users u LEFT JOIN id_documents d ON d.user_id = u.id' + where +
      ' ORDER BY u.created_at DESC',
      params);

    const ONLINE_MS = 90 * 1000;
    const now = Date.now();
    const users = rows.map(u => ({
      id: String(u.id),
      uid: u.id,
      name: u.name || u.username || u.email,
      username: u.username || u.name || u.email,
      email: u.email,
      country: u.country || '',
      status: u.status || 'pending',
      rejectReason: u.reject_reason || '',
      createdAt: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString(),
      created_at: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString(),
      hasDoc: !!u.has_doc,
      hasIdDoc: !!u.has_doc,
      idDocType: u.doc_type || '',
      kycType: u.doc_type || (u.has_doc ? 'وثيقة هوية' : 'لا توجد وثيقة'),
      lastSeen: Number(u.last_seen) || 0,
      online: !!u.last_seen && (now - Number(u.last_seen)) < ONLINE_MS,
    }));

    res.json({ ok: true, users });
  } catch (err) {
    console.error('Error fetching admin users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin: fetch one user's identity document (base64 image) for review.
app.get('/api/admin/users/:id/id-doc', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT doc_type, image, created_at FROM id_documents WHERE user_id = ? LIMIT 1',
      [req.params.id]);
    const d = rows[0];
    if (!d || !d.image) {
      // fallback to the JSON store (older documents)
      const legacy = (store && store.getIdDoc) ? store.getIdDoc(String(req.params.id)) : null;
      if (legacy && legacy.image) return res.json({ ok: true, type: legacy.type || '', image: legacy.image, at: legacy.at || 0 });
      return res.status(404).json({ error: 'no_doc' });
    }
    res.json({ ok: true, type: d.doc_type || '', image: d.image, at: d.created_at ? new Date(d.created_at).getTime() : 0 });
  } catch (err) {
    console.error('id-doc error:', err);
    res.status(500).json({ error: 'doc_failed' });
  }
});

// Admin: change a user's KYC/approval status in MySQL (source of truth).
async function adminSetStatus(id, status, reason, action, res) {
  try {
    const [r] = await pool.query(
      'UPDATE users SET status = ?, reject_reason = ? WHERE id = ?',
      [status, reason || null, id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'not_found' });
    const u = await dbGetUserById(id);
    try { store.logAdmin && store.logAdmin({ admin: 'admin', action: action || status, targetId: String(id), targetEmail: u && u.email, targetName: u && (u.name || u.username) }); } catch (e) {}
    res.json({ ok: true, user: dbPublicUser(u) });
  } catch (err) {
    console.error('adminSetStatus error:', err);
    res.status(500).json({ error: 'status_failed' });
  }
}

app.post('/api/admin/users/:id/approve', requireAdmin, (req, res) =>
  adminSetStatus(req.params.id, 'approved', null, 'approve', res));

app.post('/api/admin/users/:id/reject', requireAdmin, (req, res) => {
  const reason = String((req.body || {}).reason || '').slice(0, 300);
  adminSetStatus(req.params.id, 'rejected', reason, 'reject', res);
});

app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) =>
  adminSetStatus(req.params.id, 'banned', null, 'ban', res));

app.post('/api/admin/users/:id/unban', requireAdmin, (req, res) =>
  adminSetStatus(req.params.id, 'approved', null, 'unban', res));

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM id_documents WHERE user_id = ?', [req.params.id]);
    await pool.query('DELETE FROM wallets WHERE user_id = ?', [req.params.id]);
    const [r] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    try { store.deleteUser && store.deleteUser(String(req.params.id)); } catch (e) {}
    res.json({ ok: !!r.affectedRows });
  } catch (err) {
    console.error('delete user error:', err);
    res.status(500).json({ error: 'delete_failed' });
  }
});

// ---- Admin: send a notification to one user ----
// Resolve a user by id from MySQL (source of truth), returning a store-shaped
// object so the existing ledger helpers (addDeposit / applyDeltas / balances)
// keep working, keyed by the SAME id string.
async function adminResolveUser(id) {
  const dbu = await dbGetUserById(id);
  if (!dbu) return null;
  let su = null;
  try { su = store.findUserById(String(dbu.id)); } catch (e) {}
  return {
    id: String(dbu.id), uid: dbu.id,
    name: dbu.name || dbu.username || dbu.email,
    email: dbu.email,
    balances: (su && su.balances) ? su.balances : {},
  };
}

app.post('/api/admin/users/:id/notify', requireAdmin, async (req, res) => {
  const { title, body } = req.body || {};
  const t = String(title || '').trim();
  const b = String(body || '').trim();
  if (!t && !b) return res.status(400).json({ error: 'empty' });
  const u = await adminResolveUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const n = store.addNotification(u.id, { title: t, body: b, kind: 'admin' });
  store.logAdmin({ admin: 'admin', action: 'notify', targetId: u.id, targetEmail: u.email, targetName: u.name, note: (t || b).slice(0, 200) });
  res.json({ ok: true, notification: n });
});

// ---- Admin: credit an account (records a deposit + notifies the user) ----
app.post('/api/admin/users/:id/credit', requireAdmin, async (req, res) => {
  const { amount, currency, note } = req.body || {};
  const cur = String(currency || 'USDT').toUpperCase();
  const amt = Number(amount);
  if (!/^[A-Z0-9]{2,12}$/.test(cur)) return res.status(400).json({ error: 'bad_currency' });
  if (!(amt > 0) || !isFinite(amt)) return res.status(400).json({ error: 'bad_amount' });
  const u = await adminResolveUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const dep = store.addDeposit(u.id, {
    amount: amt, currency: cur, kind: 'admin', from: 'ADMIN', fromName: 'الإدارة',
    note: String(note || 'شحن رصيد من الإدارة').slice(0, 200),
  });
  store.addNotification(u.id, {
    title: 'شحن رصيد',
    body: 'تمت إضافة ' + amt + ' ' + cur + ' إلى رصيدك من الإدارة.',
  });
  store.addTransaction(u.id, {
    type: 'admin_credit', amount: amt, currency: cur,
    counterparty: 'الإدارة', note: String(note || 'شحن رصيد من الإدارة').slice(0, 200),
  });
  store.logAdmin({
    admin: 'admin', action: 'credit', targetId: u.id, targetEmail: u.email, targetName: u.name,
    amount: amt, currency: cur, note: String(note || 'شحن رصيد').slice(0, 200),
  });
  res.json({ ok: true, deposit: dep });
});

// ---- Admin: read ONE user's full per-currency balances (أرصدة وعملات المستخدم) ----
app.get('/api/admin/users/:id/balances', requireAdmin, async (req, res) => {
  const u = await adminResolveUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, id: u.id, uid: u.uid, name: u.name || '', email: u.email || '', balances: u.balances || {} });
});

// ---- Admin: manually adjust a user's balance for ANY coin (add / subtract / set) ----
// body: { currency, amount, mode: 'add' | 'sub' | 'set' }. Every change is
// written to the admin activity log (action: 'balance_adjust') so edits are
// auditable, plus a user transaction + notification.
app.post('/api/admin/users/:id/balance', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const cur = String(b.currency || '').toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(cur)) return res.status(400).json({ error: 'bad_currency' });
  const amt = Number(b.amount);
  if (!isFinite(amt)) return res.status(400).json({ error: 'bad_amount' });
  const u0 = await adminResolveUser(req.params.id);
  if (!u0) return res.status(404).json({ error: 'not_found' });
  const mode = (b.mode === 'add' || b.mode === 'sub') ? b.mode : 'set';
  const curBal = Number((u0.balances || {})[cur]) || 0;
  let target;
  if (mode === 'add') target = curBal + Math.abs(amt);
  else if (mode === 'sub') target = curBal - Math.abs(amt);
  else target = Math.abs(amt);
  if (!(target >= 0)) target = 0;
  const delta = +(target - curBal).toFixed(10);
  let u = u0;
  if (delta !== 0) {
    u = store.applyDeltas(u0.id, { [cur]: delta });
    if (!u) return res.status(400).json({ error: 'apply_failed' });
  }
  const note = 'تعديل يدوي (' + mode + ') ← ' + target + ' ' + cur;
  store.addTransaction(u.id, {
    type: delta >= 0 ? 'admin_credit' : 'admin_debit', amount: Math.abs(delta), currency: cur,
    counterparty: 'الإدارة', note: 'تعديل رصيد يدوي من الإدارة',
  });
  store.logAdmin({
    admin: 'admin', action: 'balance_adjust', targetId: u.id, targetEmail: u.email, targetName: u.name,
    amount: delta, currency: cur, note,
  });
  res.json({ ok: true, currency: cur, newBalance: target, delta, balances: u.balances || {} });
});
// ---- Admin: financial transactions ledger (all users) ----
// Optional ?userId=... to filter to a single account.
app.get('/api/admin/transactions', requireAdmin, (req, res) => {
  const uid = req.query.userId ? String(req.query.userId) : '';
  const rows = uid ? store.getTransactions(uid).map((t) => {
    const u = store.findUserById(uid) || {};
    return { userId: uid, uid: u.uid, userName: u.name || '', userEmail: u.email || '', ...t };
  }) : store.getAllTransactions();
  res.json({ ok: true, transactions: rows });
});

// ---- Admin: activity log (credits / balance edits / bans / notifications) ----
app.get('/api/admin/logs', requireAdmin, (req, res) => {
  res.json({ ok: true, logs: store.getAdminLogs() });
});
// ---- Admin: SECURITY log (balance-tampering / money-safety attempts) ----
// Returns the money-safety audit trail plus a quick summary (counts by
// severity and last-24h). Optional ?severity=critical|warning|info filter.
app.get('/api/admin/security-logs', requireAdmin, (req, res) => {
  const entries = security.entries;
  const dayAgo = Date.now() - 86400000;
  const summary = {
    total: security.count,
    stored: entries.length,
    critical: entries.filter((e) => e.severity === 'critical').length,
    warning: entries.filter((e) => e.severity === 'warning').length,
    info: entries.filter((e) => e.severity === 'info').length,
    last24h: entries.filter((e) => e.at >= dayAgo).length,
  };
  const sev = String(req.query.severity || '').trim();
  let logs = entries;
  if (sev === 'critical' || sev === 'warning' || sev === 'info') logs = entries.filter((e) => e.severity === sev);
  res.json({ ok: true, summary, logs: logs.slice(0, 200) });
});
// ---- Admin: live order book (all pending + recent executed orders) ----
// Lets the admin monitor every account's server-side orders in real time:
// open (pending) limit orders plus the most recent filled/canceled ones,
// each enriched with the owner's name/email and the current OUR-price mark.
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const enrich = (o) => {
    const u = store.findUserById(o.userId) || {};
    return {
      id: o.id,
      userName: u.name || '', userEmail: u.email || '', uid: u.uid || '',
      sym: o.sym, base: o.base, quote: o.quote, side: o.side,
      price: o.price, qty: o.qty, notional: (Number(o.price) || 0) * (Number(o.qty) || 0),
      status: o.status, createdAt: o.createdAt || 0, filledAt: o.filledAt || 0,
      canceledAt: o.canceledAt || 0, cancelReason: o.cancelReason || '',
      execPrice: o.execPrice || 0, mark: priceOf(o.sym) || 0,
    };
  };
  const open = orders.filter((o) => o.status === 'open').map(enrich);
  const recent = orders.filter((o) => o.status !== 'open').slice(0, 80).map(enrich);
  const openNotional = open.reduce((s, o) => s + (o.notional || 0), 0);
  res.json({ ok: true, open, recent, openCount: open.length, openNotional });
});

// ---- Admin: live balances & total liquidity ----
// Values each account's reported balances using OUR live price caches
// (full market cache first, then the tracked-price cache), so the numbers
// are live and consistent with what users see on the pages.
function priceOf(sym) {
  const list = markets.getAll() || [];
  const m = list.find((t) => (t.symbol || t.s) === sym);
  if (m) {
    const v = m.lastPrice != null ? m.lastPrice : (m.c != null ? m.c : m.price);
    const n = parseFloat(v);
    if (isFinite(n)) return n;
  }
  const p = prices.get ? prices.get(sym) : null;
  if (p) {
    const v = p.price != null ? p.price : (p.c != null ? p.c : p.lastPrice);
    const n = parseFloat(v);
    if (isFinite(n)) return n;
  }
  return null;
}
const STABLES = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI']);
function valueUsd(balances) {
  let total = 0;
  for (const k in (balances || {})) {
    const amt = Number(balances[k]) || 0;
    if (amt <= 0) continue;
    if (STABLES.has(k)) { total += amt; continue; }
    const px = priceOf(k + 'USDT');
    if (px) total += amt * px;
  }
  return total;
}

app.get('/api/admin/liquidity', requireAdmin, async (req, res) => {
  try {
    const ONLINE_MS = 90 * 1000;
    const now = Date.now();
    const [users] = await pool.query(
      'SELECT id, username, name, email, status, last_seen FROM users ORDER BY created_at DESC');
    const [wals] = await pool.query('SELECT user_id, currency, balance FROM wallets');
    const byUser = {};
    for (const w of wals) {
      const uid = String(w.user_id);
      const cur = String(w.currency || 'USDT').toUpperCase();
      byUser[uid] = byUser[uid] || {};
      byUser[uid][cur] = (Number(byUser[uid][cur]) || 0) + Number(w.balance || 0);
    }
    const rows = users.map((u) => {
      const uid = String(u.id);
      // ادمج أرصدة جدول wallets مع أي أرصدة في دفتر store (إن وجدت)
      const balances = Object.assign({}, byUser[uid] || {});
      try {
        const su = store.findUserById(uid);
        if (su && su.balances) for (const k in su.balances) {
          balances[k] = (Number(balances[k]) || 0) + Number(su.balances[k] || 0);
        }
      } catch (e) { /* ignore */ }
      const balanceUsd = valueUsd(balances);
      return {
        id: uid, uid: u.id,
        name: u.name || u.username || u.email,
        email: u.email,
        status: u.status || 'pending',
        balanceUsd, balances,
        lastSeen: Number(u.last_seen) || 0,
        online: !!u.last_seen && (now - Number(u.last_seen)) < ONLINE_MS,
      };
    }).sort((a, b) => b.balanceUsd - a.balanceUsd);
    const totalLiquidity = rows.reduce((s, r) => s + r.balanceUsd, 0);
    const online = rows.filter((r) => r.online).length;
    res.json({ ok: true, rows, totalLiquidity, online, count: rows.length });
  } catch (err) {
    console.error('liquidity error:', err);
    res.status(500).json({ error: 'liquidity_failed' });
  }
});

// ---- Admin: platform commission (trading fees collected) ----
// Returns the running commission totals (per currency), their total USD value
// using OUR live price caches, the number of fee events, and the most recent
// entries so the admin can audit where the revenue came from.
app.get('/api/admin/commission', requireAdmin, (req, res) => {
  const totals = commission.totals || {};
  res.json({
    ok: true,
    totals,
    totalUsd: valueUsd(totals),
    count: commission.count || 0,
    entries: (commission.entries || []).slice(0, 100),
  });
});

// ---- Admin: withdraw platform commission into a real account ----
// Moves the accumulated commission (per currency) OUT of the platform ledger
// and INTO a chosen account's real wallet balance (by UID or email). After
// this the ledger totals are reset to zero and the owner can withdraw the
// funds from that account like any normal balance. The move is logged and a
// deposit record is created so it is fully auditable.
app.post('/api/admin/commission/withdraw', requireAdmin, (req, res) => {
  const { uid, email } = req.body || {};
  let u = null;
  if (uid) u = store.listUsers().find((x) => String(x.uid) === String(uid)) || store.findUserById(String(uid));
  if (!u && email) u = store.findUserByEmail(String(email).trim().toLowerCase());
  if (!u) return res.status(404).json({ error: 'account_not_found' });

  const totals = commission.totals || {};
  const moved = {};
  let any = false;
  for (const cur in totals) {
    const amt = Number(totals[cur]) || 0;
    if (!(amt > 0)) continue;
    any = true;
    moved[cur] = amt;
    store.addDeposit(u.id, {
      amount: amt, currency: cur, kind: 'admin', from: 'COMMISSION', fromName: 'حساب عمولات المنصة',
      note: 'سحب عمولات المنصة',
    });
    store.addTransaction(u.id, {
      type: 'admin_credit', amount: amt, currency: cur,
      counterparty: 'عمولات المنصة', note: 'تحويل رصيد العمولات',
    });
    commission.entries.unshift({
      amount: amt, currency: cur, userId: u.id, userName: u.name || '',
      source: 'withdraw', at: Date.now(),
    });
  }
  if (!any) return res.status(400).json({ error: 'nothing_to_withdraw' });

  if (commission.entries.length > 500) commission.entries.length = 500;
  commission.totals = {};
  commission.count += 1;
  saveCommission();
  store.logAdmin({
    admin: 'admin', action: 'credit', targetId: u.id, targetEmail: u.email, targetName: u.name,
    amount: valueUsd(moved), currency: 'USD', note: 'سحب عمولات المنصة إلى الحساب',
  });
  res.json({ ok: true, moved, totalUsd: valueUsd(moved), account: { uid: u.uid, name: u.name, email: u.email } });
});

// ---- Admin: support chats ----
app.get('/api/admin/chats', requireAdmin, (req, res) => {
  res.json({ ok: true, chats: store.listChats() });
});

app.get('/api/admin/chats/:userId', requireAdmin, (req, res) => {
  store.markRead(String(req.params.userId), 'admin');
  res.json({ ok: true, messages: store.getMessages(String(req.params.userId)) });
});

app.post('/api/admin/chats/:userId/reply', requireAdmin, (req, res) => {
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'empty' });
  const msg = store.addMessage(String(req.params.userId), 'admin', text);
  res.json({ ok: true, message: msg });
});

// ---- APX platform coin: public + admin endpoints ----
// Public reads (shared by all pages). Config + price history.
app.get('/api/apx', (req, res) => { res.json(apx.config()); });
app.get('/api/apx/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 500, 5000);
  res.json(apx.history(limit));
});
// شموع APX المركزية (نفس الشموع لكل الحسابات، محفوظة على السيرفر)
app.get('/api/apx/klines', (req, res) => {
  const interval = String(req.query.interval || '15m');
  const limit = Math.min(Number(req.query.limit) || 300, 1000);
  res.json(apx.klines(interval, limit));
});
// A logged-in user reports an APX buy; the server decides if it is "big"
// (>= APX_BIG_ORDER USDT) and, if so, records an admin notification. The email
// is taken from the authenticated session, never trusted from the client body.
app.post('/api/apx/notify', requireUser, (req, res) => {
  const b = req.body || {};
  res.json(apx.notify({ side: b.side, qty: b.qty, price: b.price, value: b.value, email: req.user.email }));
});
// A logged-in user executes an APX trade; the server applies market impact
// (buys push the price up, sells push it down; bigger orders move it more)
// and returns the updated config so every page converges on the same price.
app.post('/api/apx/trade', requireUser, (req, res) => {
  const b = req.body || {};
  res.json(apx.trade({ side: b.side, qty: b.qty, value: b.value, email: req.user.email }));
});
// رصيد المستخدم الحالي من APX (مرجعي على السيرفر)
app.get('/api/apx/holding', requireUser, (req, res) => {
  const qty = apx.getHold(req.user.email);
  res.json({ qty, usdt: +(qty * apx.config().price).toFixed(2) });
});
// سجل عمليات APX للمستخدم (Order History)
app.get('/api/apx/orders', requireUser, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(apx.orders({ email: req.user.email, limit }));
});
// Admin: read full config + history, update price/change/volume/supply/enabled,
// and manage big-order notifications. All guarded by requireAdmin.
app.get('/api/admin/apx', requireAdmin, (req, res) => {
  res.json({ config: apx.config(), history: apx.history(500), bigOrder: apx.bigOrder });
});
// أرصدة المستخدمين من APX مقيّمة بالدولار (للوحة الأدمن)
app.get('/api/admin/apx/holdings', requireAdmin, (req, res) => {
  res.json(apx.holdingsList());
});
// إدارة يدوية لرصيد مستخدم من APX (ضبط لقيمة محددة أو إضافة/خصم)
// body: { email, qty, mode: 'set' | 'add' }
app.post('/api/admin/apx/holding', requireAdmin, (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: 'bad_email' });
  const n = Number(b.qty);
  if (!isFinite(n)) return res.status(400).json({ ok: false, error: 'bad_qty' });
  const qty = (b.mode === 'add') ? apx.addHold(email, n) : apx.setHold(email, n);
  res.json({ ok: true, email, qty, usdt: +(qty * apx.config().price).toFixed(2) });
});
app.post('/api/admin/apx', requireAdmin, (req, res) => {
  res.json({ ok: true, config: apx.update(req.body || {}) });
});
app.get('/api/admin/apx/notifications', requireAdmin, (req, res) => {
  res.json(apx.notifications({ unreadOnly: req.query.unread === '1' }));
});
app.post('/api/admin/apx/notifications/read', requireAdmin, (req, res) => {
  res.json(apx.markRead((req.body && req.body.ids) || null));
});

// ---- Static frontend ----
app.use(express.static(join(__dirname, 'public')));

app.listen(3000, '0.0.0.0', () => {
    console.log('Server is running');
});
app.post('/api/auth/register', strictLimiter, async (req, res) => {
  try {
    const { name, email, password, country, idDocType, idImage } = req.body || {};

    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'bad_name' });
    if (!EMAIL_RE.test(String(email || ''))) return res.status(400).json({ error: 'bad_email' });
    if (!password || String(password).length < 8) return res.status(400).json({ error: 'weak_password' });

    const emailNorm = String(email).trim().toLowerCase();
    const cleanName = String(name).trim().slice(0, 120);
    const cleanCountry = String(country || '').trim().slice(0, 80);
    const img = validIdImage(idImage);
    const docType = ID_DOC_TYPES.has(String(idDocType || '')) ? String(idDocType) : null;

    // التحقق من وجود الإيميل مسبقاً
    const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [emailNorm]);
    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'email_exists' });
    }

    // حالة الحساب: pending إذا كان التوثيق يتطلّب موافقة الأدمن (الافتراضي)
    const status = REQUIRE_APPROVAL ? 'pending' : 'approved';

    // إدخال المستخدم مع كلمة مرور مشفّرة والحالة
    const [result] = await pool.query(
      'INSERT INTO users (username, name, email, password, status, country) VALUES (?, ?, ?, ?, ?, ?)',
      [cleanName, cleanName, emailNorm, hashPassword(password), status, cleanCountry]
    );
    const userId = result.insertId;

    // حفظ وثيقة الهوية (KYC) إن وجدت
    if (img && docType) {
      try {
        await pool.query(
          'INSERT INTO id_documents (user_id, doc_type, image) VALUES (?, ?, ?) ' +
          'ON DUPLICATE KEY UPDATE doc_type = VALUES(doc_type), image = VALUES(image)',
          [userId, docType, img]);
        try { store.setIdDoc(String(userId), docType, img); } catch (e) {}
      } catch (e) { console.warn('[register] id-doc save failed:', e.message); }
    }

    // إنشاء محفظة افتراضية برصيد 0
    await pool.query(
      'INSERT INTO wallets (user_id, currency, balance, locked_balance) VALUES (?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE balance = balance',
      [userId, 'USDT', 0.00000000, 0.00000000]
    );

    // أصدر توكناً حتى يستطيع المستخدم دخول واجهة الانتظار (تحت المراجعة)
    const token = signUserToken(userId);
    res.json({
      ok: true,
      token,
      status,
      user: { id: String(userId), uid: userId, username: cleanName, name: cleanName, email: emailNorm, status }
    });
  } catch (err) {
    console.error('MySQL Register Error:', err);
    res.status(500).json({ error: 'Database insertion failed' });
  }
});
app.post('/api/wallet/withdraw', requireUser, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user.uid;
    const amount = Number((req.body || {}).amount);

    if (!userId) {
      connection.release();
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!amount || !isFinite(amount) || amount <= 0) {
      connection.release();
      return res.status(400).json({ error: 'invalid_amount' });
    }

    // 1. بدء المعاملة المالية
    await connection.beginTransaction();

    // 2. قفل صف المحفظة مؤقتاً لمنع التلاعب المزدوج
    const [wallets] = await connection.query(
      'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
      [userId]
    );

    if (wallets.length === 0 || wallets[0].balance < amount) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: 'insufficient_balance' });
    }

    // 3. خصم المبلغ من رصيد محفظة المستخدم
    await connection.query(
      'UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
      [amount, userId]
    );

    // 4. اعتماد المعاملة نهائياً
    await connection.commit();
    connection.release();

    res.json({ ok: true, message: 'Withdrawal successful' });

  } catch (err) {
    // 5. التراجع عن التغييرات في حال حدوث أي خطأ
    await connection.rollback();
    connection.release();
    console.error('Transaction Error:', err);
    res.status(500).json({ error: 'Transaction failed' });
  }
});