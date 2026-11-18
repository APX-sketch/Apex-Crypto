// lib/otpDb.js
// ─────────────────────────────────────────────────────────────
//  طبقة OTP وقفل المحاولات — دائمة في قاعدة البيانات (TiDB)
//  كان الرمز والعدّادات بالذاكرة، فأي إعادة تشغيل / سبات على Render
//  تصفّرها: المستخدم يطلب رمزاً جديداً أو يُفلَت من قفل 24 ساعة.
//  الآن كل شيء في جدولين:
//     otp_codes(scope, k, code_hash, expires_at, tries, meta, created_at)
//     login_blocks(email, fails, codes, lock_until, updated_at)
//
//  التصميم:
//   • نفس واجهة OtpStore / LoginGuard، لكن الدوال async.
//   • الرمز يُخزَّن مُبشَّراً (SHA-256) لا كنص صريح.
//   • عند تعذّر قاعدة البيانات، يتحوّل تلقائياً للذاكرة حتى لا يتوقف
//     الدخول أبداً (fail-safe) — ويُسجّل تحذيراً.
//   • كل الجمل SQL بسيطة (بدون JOIN) لتكون سريعة وآمنة على TiDB.
// ─────────────────────────────────────────────────────────────
import { createHash, randomInt } from 'node:crypto';
import { OtpStore } from './otp.js';
import { LoginGuard, OTP_TTL_MS, LOCK_HOURS } from './loginGuard.js';

export { OTP_TTL_MS, LOCK_HOURS };

const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

let _schemaReady = false;
let _schemaPromise = null;

export async function ensureOtpSchema(pool) {
  if (_schemaReady) return true;
  if (_schemaPromise) return _schemaPromise;
  _schemaPromise = (async () => {
    try {
      await pool.query(
        'CREATE TABLE IF NOT EXISTS otp_codes (' +
        ' scope VARCHAR(24) NOT NULL,' +
        ' k VARCHAR(190) NOT NULL,' +
        ' code_hash CHAR(64) NOT NULL,' +
        ' expires_at BIGINT NOT NULL,' +
        ' tries INT NOT NULL DEFAULT 0,' +
        ' meta TEXT NULL,' +
        ' created_at BIGINT NOT NULL,' +
        ' PRIMARY KEY (scope, k),' +
        ' KEY idx_exp (expires_at)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
      );
      await pool.query(
        'CREATE TABLE IF NOT EXISTS login_blocks (' +
        ' email VARCHAR(190) NOT NULL,' +
        ' fails INT NOT NULL DEFAULT 0,' +
        ' codes INT NOT NULL DEFAULT 0,' +
        ' lock_until BIGINT NOT NULL DEFAULT 0,' +
        ' updated_at BIGINT NOT NULL DEFAULT 0,' +
        ' PRIMARY KEY (email)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
      );
      _schemaReady = true;
      return true;
    } catch (e) {
      console.warn('[otpDb] تعذّر تجهيز جدولي OTP/القفل:', e && e.message);
      return false;
    }
  })();
  return _schemaPromise;
}

function parseMeta(v) {
  if (v == null || v === '') return {};
  try { return JSON.parse(v) || {}; } catch (e) { return {}; }
}

// ── مخزن رموز OTP دائم ─────────────────────────────────────────
// scope يفصل أنواع الرموز (login / email_change / withdraw ...).
export class DbOtpStore {
  constructor({ pool, scope = 'login', ttlMs = 59000, maxTries = 3 } = {}) {
    this.pool = pool;
    this.scope = String(scope || 'login').slice(0, 24);
    this.ttl = ttlMs;
    this.max = maxTries;
    this._mem = new OtpStore({ ttlMs, maxTries });   // خطة بديلة عند تعذّر DB
    this.durable = true;
  }

  async issue(key, meta = {}) {
    const k = String(key || '').trim().toLowerCase();
    const code = String(randomInt(100000, 1000000));
    const exp = Date.now() + this.ttl;
    if (!k) return { code, expiresInSec: Math.round(this.ttl / 1000) };
    try {
      await this.pool.query(
        'INSERT INTO otp_codes (scope, k, code_hash, expires_at, tries, meta, created_at) ' +
        'VALUES (?, ?, ?, ?, 0, ?, ?) ON DUPLICATE KEY UPDATE ' +
        'code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), tries = 0, ' +
        'meta = VALUES(meta), created_at = VALUES(created_at)',
        [this.scope, k, sha256(code), exp, JSON.stringify(meta || {}), Date.now()]
      );
      this.durable = true;
      return { code, expiresInSec: Math.round(this.ttl / 1000) };
    } catch (e) {
      this.durable = false;
      console.warn('[otpDb] issue: تحوّلنا للذاكرة —', e && e.message);
      return this._mem.issue(k, meta);
    }
  }

  async verify(key, code) {
    const k = String(key || '').trim().toLowerCase();
    const c = String(code || '').trim();
    if (!k) return { ok: false, error: 'otp_required' };
    let row = null;
    try {
      const [rows] = await this.pool.query(
        'SELECT code_hash, expires_at, tries, meta FROM otp_codes WHERE scope = ? AND k = ?',
        [this.scope, k]);
      row = (rows && rows[0]) ? rows[0] : null;
    } catch (e) {
      console.warn('[otpDb] verify: تحوّلنا للذاكرة —', e && e.message);
      return this._mem.verify(k, c);
    }
    if (!row) return { ok: false, error: 'otp_required' };
    if (Date.now() > Number(row.expires_at)) {
      try { await this.pool.query('DELETE FROM otp_codes WHERE scope = ? AND k = ?', [this.scope, k]); } catch (e) {}
      return { ok: false, error: 'otp_expired' };
    }
    const tries = Number(row.tries) || 0;
    if (tries >= this.max) {
      try { await this.pool.query('DELETE FROM otp_codes WHERE scope = ? AND k = ?', [this.scope, k]); } catch (e) {}
      return { ok: false, error: 'otp_locked' };
    }
    if (sha256(c) !== String(row.code_hash)) {
      try { await this.pool.query('UPDATE otp_codes SET tries = tries + 1 WHERE scope = ? AND k = ?', [this.scope, k]); } catch (e) {}
      return { ok: false, error: 'otp_invalid', triesLeft: Math.max(0, this.max - tries - 1) };
    }
    try { await this.pool.query('DELETE FROM otp_codes WHERE scope = ? AND k = ?', [this.scope, k]); } catch (e) {}
    return { ok: true, meta: parseMeta(row.meta) };
  }

  // قراءة بلا استهلاك (صفحة التطوير فقط)
  async peek(key) {
    const k = String(key || '').trim().toLowerCase();
    try {
      const [rows] = await this.pool.query(
        'SELECT code_hash, expires_at, tries, meta FROM otp_codes WHERE scope = ? AND k = ?',
        [this.scope, k]);
      const r = (rows && rows[0]) ? rows[0] : null;
      if (!r) return null;
      return { exp: Number(r.expires_at), tries: Number(r.tries) || 0, meta: parseMeta(r.meta), code: null };
    } catch (e) {
      return this._mem.peek(k);
    }
  }

  async clear(key) {
    const k = String(key || '').trim().toLowerCase();
    this._mem.clear(k);
    try { await this.pool.query('DELETE FROM otp_codes WHERE scope = ? AND k = ?', [this.scope, k]); } catch (e) {}
  }
}

// ── قفل المحاولات الدائم ──────────────────────────────────────
// نفس منطق LoginGuard تماماً: 3 أخطاء على الرمز → رمز جديد،
// 3 رموز فاشلة (9 أخطاء) → قفل 24 ساعة.
export class DbLoginGuard {
  constructor({ pool, lockMs = LOCK_HOURS * 3600 * 1000 } = {}) {
    this.pool = pool;
    this.lockMs = lockMs;
    this._mem = new LoginGuard({ lockMs });
  }

  async _row(email) {
    const key = String(email || '').trim().toLowerCase();
    const [rows] = await this.pool.query(
      'SELECT fails, codes, lock_until FROM login_blocks WHERE email = ?', [key]);
    let r = (rows && rows[0]) ? rows[0] : null;
    if (!r) return { key, lock_until: 0, fails: 0, codes: 0, fresh: true };
    const lockUntil = Number(r.lock_until) || 0;
    if (lockUntil && Date.now() >= lockUntil) {
      // انتهت مدة القفل → تصفير كامل
      await this._write(key, 0, 0, 0);
      return { key, lock_until: 0, fails: 0, codes: 0, fresh: false };
    }
    return { key, lock_until: lockUntil, fails: Number(r.fails) || 0, codes: Number(r.codes) || 0, fresh: false };
  }

  async _write(key, fails, codes, lockUntil) {
    await this.pool.query(
      'INSERT INTO login_blocks (email, fails, codes, lock_until, updated_at) VALUES (?, ?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE fails = VALUES(fails), codes = VALUES(codes), ' +
      'lock_until = VALUES(lock_until), updated_at = VALUES(updated_at)',
      [key, fails, codes, lockUntil, Date.now()]);
  }

  async lockedFor(email) {
    const key = String(email || '').trim().toLowerCase();
    try {
      const r = await this._row(key);
      if (!r.lock_until) return 0;
      const left = Math.ceil((r.lock_until - Date.now()) / 1000);
      return left > 0 ? left : 0;
    } catch (e) {
      console.warn('[otpDb] guard: تحوّلنا للذاكرة —', e && e.message);
      return this._mem.lockedFor(key);
    }
  }

  async beginCode(email) {
    const key = String(email || '').trim().toLowerCase();
    try {
      const r = await this._row(key);
      // رمز جديد = محاولات جديدة، لكن عدد الرموز الفاشلة يبقى محسوباً
      await this._write(key, r.fails, 0, 0);
      return { triesLeft: 3, codesLeft: Math.max(0, 3 - r.fails) };
    } catch (e) {
      return this._mem.beginCode(key);
    }
  }

  async fail(email) {
    const key = String(email || '').trim().toLowerCase();
    try {
      const r = await this._row(key);
      const codesNow = (Number(r.codes) || 0) + 1;
      const triesLeft = Math.max(0, 3 - codesNow);
      if (triesLeft > 0) {
        await this._write(key, r.fails, codesNow, 0);
        return { triesLeft, codesLeft: Math.max(0, 3 - r.fails) };
      }
      // خلصت محاولات هذا الرمز → يُحسب رمزاً فاشلاً
      const failsNow = (Number(r.fails) || 0) + 1;
      if (failsNow >= 3) {
        const until = Date.now() + this.lockMs;
        await this._write(key, 0, 0, until);
        return { locked: true, retryAfterSec: Math.ceil(this.lockMs / 1000), triesLeft: 0, codesLeft: 0 };
      }
      await this._write(key, failsNow, 0, 0);
      return { needNewCode: true, triesLeft: 0, codesLeft: Math.max(0, 3 - failsNow) };
    } catch (e) {
      return this._mem.fail(key);
    }
  }

  async success(email) {
    const key = String(email || '').trim().toLowerCase();
    this._mem.success(key);
    try { await this.pool.query('DELETE FROM login_blocks WHERE email = ?', [key]); } catch (e) {}
  }
}
