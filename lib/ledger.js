// ledger.js — دفتر أستاذ دائم لكل حركة رصيد (مصدر الحقيقة الدائم)
// ------------------------------------------------------------
// لماذا؟ لأن Render يقتل العملية (SIGKILL) بلا انتظار، فيضيع أي تغيير
// لم يُكتب في نفس اللحظة. الحل: كل عملية رصيد تُكتب صفّاً مستقلاً في
// MySQL فوراً (INSERT واحد صغير) قبل أي شيء آخر. ولأنها صفوف صغيرة
// ومستقلة، فهي لا تُطمس بالكتابة فوقها، وتُستعاد الأرصدة منها بالكامل.
//
// الجداول:
//   wx_ledger     : كل حركة (مستخدم، عملة، مقدار موقّع، مصدر، وقت)
//   wx_balances   : الأرصدة الحالية المجمّعة (لقراءة سريعة)
//   wx_meta       : قيم صغيرة (مثل آخر رقم حركة مطبّق)
// ============================================================
import mysql from 'mysql2/promise';

let _pool = null;
let _ready = false;
let _initPromise = null;

function dbConfig() {
  return {
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, ssl: { rejectUnauthorized: false },
    connectionLimit: 4,
  };
}

function getPool() {
  if (!_pool) _pool = mysql.createPool(dbConfig());
  return _pool;
}

const DDL = [
  'CREATE TABLE IF NOT EXISTS wx_ledger (' +
  ' id BIGINT AUTO_INCREMENT PRIMARY KEY,' +
  ' user_id VARCHAR(64) NOT NULL,' +
  ' currency VARCHAR(16) NOT NULL,' +
  ' amount DECIMAL(30,10) NOT NULL,' +
  ' kind VARCHAR(32) NOT NULL,' +
  ' ref VARCHAR(191) NULL,' +
  ' note VARCHAR(255) NULL,' +
  ' created_at BIGINT NOT NULL,' +
  ' INDEX idx_user (user_id),' +
  ' INDEX idx_created (created_at)' +
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
  'CREATE TABLE IF NOT EXISTS wx_balances (' +
  ' user_id VARCHAR(64) NOT NULL,' +
  ' currency VARCHAR(16) NOT NULL,' +
  ' balance DECIMAL(30,10) NOT NULL DEFAULT 0,' +
  ' updated_at BIGINT NULL,' +
  ' PRIMARY KEY (user_id, currency)' +
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
];

async function ensure() {
  if (_ready) return true;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const p = getPool();
      for (const sql of DDL) await p.query(sql);
      _ready = true;
      return true;
    } catch (e) {
      console.warn('[ledger] تعذّر تجهيز الجداول:', e.message);
      return false;
    }
  })();
  return _initPromise;
}

/**
 * سجّل حركة رصيد واحدة كتابةً دائمة وفورية.
 * @returns {Promise<boolean>} نجاح الكتابة
 */
async function record(userId, currency, amount, kind, ref, note) {
  try {
    const p = getPool();
    const cur = String(currency || '').toUpperCase().slice(0, 16);
    const amt = Number(amount);
    if (!userId || !cur || !isFinite(amt) || amt === 0) return false;
    await p.query(
      'INSERT INTO wx_ledger (user_id, currency, amount, kind, ref, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [String(userId).slice(0, 64), cur, amt, String(kind || 'op').slice(0, 32),
       ref == null ? null : String(ref).slice(0, 191),
       note == null ? null : String(note).slice(0, 255), Date.now()]);
    // حدّث الرصيد المجمّع بنفس الطلب (ذرّي على مستوى الصف)
    await p.query(
      'INSERT INTO wx_balances (user_id, currency, balance, updated_at) VALUES (?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance), updated_at = VALUES(updated_at)',
      [String(userId).slice(0, 64), cur, amt, Date.now()]);
    return true;
  } catch (e) {
    console.warn('[ledger] تعذّر تسجيل الحركة:', e.message);
    return false;
  }
}

/** كل أرصدة المستخدم من الجدول المجمّع. */
async function balancesOf(userId) {
  try {
    const p = getPool();
    const [rows] = await p.query('SELECT currency, balance FROM wx_balances WHERE user_id = ?', [String(userId)]);
    const out = {};
    for (const r of rows) {
      const n = Number(r.balance) || 0;
      if (n > 0) out[r.currency] = n;
    }
    return out;
  } catch (e) { return null; }
}

/** كل الأرصدة لكل المستخدمين { userId: { CUR: n } }. */
async function allBalances() {
  try {
    const p = getPool();
    const [rows] = await p.query('SELECT user_id, currency, balance FROM wx_balances');
    const out = {};
    for (const r of rows) {
      const n = Number(r.balance) || 0;
      if (!(n > 0)) continue;
      const u = String(r.user_id);
      out[u] = out[u] || {};
      out[u][r.currency] = n;
    }
    return out;
  } catch (e) { return null; }
}

/**
 * أعد بناء wx_balances بالكامل من wx_ledger (المصدر الدائم).
 * يُستخدم كإصلاح أو استعادة كاملة عند الحاجة.
 */
async function rebuildFromLedger() {
  try {
    const p = getPool();
    const [rows] = await p.query(
      'SELECT user_id, currency, SUM(amount) AS bal FROM wx_ledger GROUP BY user_id, currency HAVING SUM(amount) > 0');
    if (!rows || !rows.length) return { ok: true, rows: 0 };
    const vals = rows.map((r) => [String(r.user_id), String(r.currency), Number(r.bal) || 0, Date.now()]);
    const p2 = getPool();
    for (let i = 0; i < vals.length; i += 200) {
      const chunk = vals.slice(i, i + 200);
      await p2.query(
        'INSERT INTO wx_balances (user_id, currency, balance, updated_at) VALUES ? ' +
        'ON DUPLICATE KEY UPDATE balance = VALUES(balance), updated_at = VALUES(updated_at)',
        [chunk]);
    }
    return { ok: true, rows: vals.length };
  } catch (e) {
    console.warn('[ledger] تعذّر إعادة البناء:', e.message);
    return { ok: false, error: e.message };
  }
}

/** آخر N حركة (للتدقيق). */
async function recent(limit) {
  try {
    const p = getPool();
    const [rows] = await p.query(
      'SELECT id, user_id, currency, amount, kind, ref, note, created_at FROM wx_ledger ORDER BY id DESC LIMIT ?',
      [Math.min(Math.max(Number(limit) || 100, 1), 1000)]);
    return rows || [];
  } catch (e) { return []; }
}

/** كل حركات مستخدم واحد. */
async function historyOf(userId, limit) {
  try {
    const p = getPool();
    const [rows] = await p.query(
      'SELECT id, currency, amount, kind, ref, note, created_at FROM wx_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?',
      [String(userId), Math.min(Math.max(Number(limit) || 100, 1), 1000)]);
    return rows || [];
  } catch (e) { return []; }
}

export { ensure, record, balancesOf, allBalances, rebuildFromLedger, recent, historyOf, getPool };
