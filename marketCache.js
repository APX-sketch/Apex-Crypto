// marketCache.js
// Caches the FULL Binance 24h ticker list (all trading pairs) on the SERVER.
// The markets page reads from here (our server), so no user's browser ever
// talks to Binance directly. One request from us every refreshMs, no matter
// how many users are online — this is what prevents the ban.

import { binanceFetch } from './binanceHosts.js';

/* =====================================================================
 *  توفير الباندويث (خطة Render المجانية: 5GB/شهر فقط)
 *  ---------------------------------------------------------------------
 *  كانت كل استجابة /api/markets تحمل ~3000 زوج من Binance (≈320KB خام).
 *  مع تحديث كل 5-6 ثوانٍ لكل صفحة مفتوحة، هذا وحده يستهلك عشرات
 *  الميجابايت لكل زائر في الساعة. الحل على ثلاث طبقات:
 *    1) فلترة الرموز: نرسل فقط الأزواج التي تعرضها المنصّة فعلاً
 *       (عملات المنصّة + ما يظهر في الصفحات) بدل كل السوق.
 *    2) تقليم الأرقام: تحويل النصوص الطويلة إلى أرقام مقرّبة (أقصر بكثير).
 *    3) نسخة مضغوطة جاهزة (gzip) تُحسب مرة واحدة للجميع بدل ضغط
 *       الاستجابة لكل طلب — توفير معالج + نقل بنفس الوقت.
 * ===================================================================== */

// الأزواج التي نعرضها فعلاً — يوافق ما في الصفحات (markets/index/wallet)
const QUOTES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'BTC', 'ETH', 'BNB'];
const MAJ = ['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','LTC','LINK','AVAX','DOT','TRX','BCH','SHIB','UNI','ATOM','ETC','NEAR','APT','FIL','ARB','OP','TON','MATIC'];
/* APX = عملة المنصّة نفسها (apx-coin.js: SYM='APXUSDT') — كانت ستُحجب بالفلترة */
const NEWER = ['APX','SUI','SEI','TIA','PEPE','WIF','JUP','PYTH','ENA','WLD','ORDI','STRK','ONDO','NOT','FET','RNDR','ZEC','USD1','NVDAB'];
const STABLES = ['USDT','USDC','FDUSD','BUSD','TUSD'];

function buildAllow() {
  const set = new Set();
  MAJ.concat(NEWER).forEach((b) => QUOTES.forEach((q) => { if (b !== q) set.add(b + q); }));
  // أزواج الاستيبل كوين الأساسية (لكل استيبل مقابل USDT)
  STABLES.forEach((b) => { if (b !== 'USDT') set.add(b + 'USDT'); });
  // أي زوج منصّة خاص يُضاف من متغيّر بيئة
  String(process.env.EXTRA_SYMBOLS || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean).forEach((s) => set.add(s));
  return set;
}

/* أمان إضافي: أي عملة يملكها مستخدم فعلاً يجب أن تبقى ظاهرة،
   حتى لو أُضيفت من لوحة الأدمن بعد النشر ولم تكن في القائمة. */
function withHoldings(set, holdings) {
  if (!holdings || typeof holdings !== 'object') return set;
  Object.keys(holdings).forEach((b) => {
    const base = String(b).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!base) return;
    set.add(base + 'USDT');
    set.add(base + 'USDC');
  });
  return set;
}

const round = (v) => {
  const n = parseFloat(v);
  if (!isFinite(n)) return 0;
  // 8 خانات معنوية كافية للعرض، وأقصر بكثير من النص الكامل
  return Number(n.toPrecision(8));
};

export class MarketCache {
  constructor({ refreshMs }) {
    this.refreshMs = refreshMs;
    this.data = [];        // مصفوفة مقلّمة: { s, p, c, v } (أسماء قصيرة)
    this.updatedAt = 0;
    this._timer = null;
    this._allow = buildAllow();
    this._json = null;     // نسخة JSON جاهزة للجميع
    this._gzip = null;     // نسخة مضغوطة جاهزة
    this._cacheKey = 0;
  }

  start() {
    this.refresh().catch((e) => console.warn('[marketCache]', e.message));
    this._timer = setInterval(
      () => this.refresh().catch((e) => console.warn('[marketCache]', e.message)),
      this.refreshMs,
    );
    if (this._timer.unref) this._timer.unref();
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  async refresh() {
    // Served from data-api.binance.vision first (cloud-IP safe), with fallback.
    const arr = await binanceFetch('/api/v3/ticker/24hr');
    // Keep only the fields the frontend needs (shrinks the payload a lot).
    const allow = withHoldings(new Set(this._allow), this._extraHoldings && this._extraHoldings());
    const out = [];
    for (const t of arr) {
      if (!t || !t.symbol || !allow.has(t.symbol)) continue;
      out.push({
        s: t.symbol,
        p: round(t.lastPrice),
        c: round(t.priceChangePercent),
        v: round(t.quoteVolume),
      });
    }
    this.data = out;
    this.updatedAt = Date.now();
    this._json = null;   // نُبطل النسخ المحسوبة
    this._gzip = null;
  }

  /* يربط المصدر الذي يعطي العملات المملوكة (اختياري) */
  setHoldingsSource(fn) { this._extraHoldings = fn; }

  /* الواجهة القديمة (تُبقي بقية الملفات تعمل كما هي) */
  getAll() {
    return this.data.map((r) => ({
      symbol: r.s,
      lastPrice: r.p,
      priceChangePercent: r.c,
      quoteVolume: r.v,
    }));
  }

  /* نسخة مضغوطة جاهزة — تُحسب مرة واحدة لكل دورة تحديث، لا لكل طلب */
  getPayload(zlib) {
    if (!this._json) this._json = JSON.stringify(this.data);
    const json = this._json;
    if (!zlib) return { json, gz: null };
    if (!this._gzip) {
      try { this._gzip = zlib.gzipSync(Buffer.from(json), { level: 6 }); }
      catch (e) { this._gzip = null; }
    }
    return { json, gz: this._gzip };
  }
}
