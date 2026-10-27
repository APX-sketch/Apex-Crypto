// lib/apxStore.js
// مخزن مركزي لعملة المنصّة APX (ESM).
// يحفظ إعدادات العملة + تاريخ السعر + إشعارات أوامر الشراء الكبيرة
// في ملف JSON مشترك (data/apex-apx.json)، فيضبطه الأدمن مرة واحدة
// ويظهر لكل المستخدمين على كل الأجهزة.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEF = { price: 1.00, chg: 0, vol: 1850000, supply: 100000000, enabled: true };

export class ApxStore {
  constructor(file, { bigOrder = 5000, btcKlines = null } = {}) {
    this.file = file;
    this.bigOrder = Number(bigOrder) || 5000;
    this._btcKlines = (typeof btcKlines === 'function') ? btcKlines : null;
    this.data = this._load();
    this.data.config = { ...DEF, ...(this.data.config || {}) };
    this.data.history = Array.isArray(this.data.history) ? this.data.history : [];
    this.data.notifications = Array.isArray(this.data.notifications) ? this.data.notifications : [];
    this.data.holdings = (this.data.holdings && typeof this.data.holdings === 'object') ? this.data.holdings : {};
    this.data.orders = Array.isArray(this.data.orders) ? this.data.orders : [];
    // ---- المحرّك المركزي: سلسلة شموع + هدف سعر + مرجع تغيّر (محفوظة لكل الحسابات) ----
    this.IVSEC = { '1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'1h':3600,'2h':7200,'4h':14400,'6h':21600,'8h':28800,'12h':43200,'1d':86400 };
    this.CAP = 1000;
    this.data.candles = (this.data.candles && typeof this.data.candles === 'object') ? this.data.candles : {};
    this.data.candlesBtc = (this.data.candlesBtc && typeof this.data.candlesBtc === 'object') ? this.data.candlesBtc : {};
    if (this.data.target == null) this.data.target = this.data.config.price;
    if (this.data.ref24 == null) {
      const r = this.data.config.price / (1 + (this.data.config.chg || 0) / 100);
      this.data.ref24 = (r > 0) ? r : this.data.config.price;
    }
    this._osc = 0; this._lastSave = 0;
    // مرساة التتبّع التراكمي مع BTC: سعر APX والـBTC وقت ضبط الأدمن للسعر
    this._lastBtc = (this.data.anchorBtc > 0) ? this.data.anchorBtc : null;
    if (this.data.anchorPrice == null || !(this.data.anchorPrice > 0)) {
      this.data.anchorPrice = (this.data.target != null) ? this.data.target : this.data.config.price;
    }
    if (this.data.anchorBtc != null && !(this.data.anchorBtc > 0)) this.data.anchorBtc = null;
    // بذرة تاريخ 48س حتى يظهر الرسم من أول مرة
    if (!this.data.history.length) {
      const now = Date.now(); const p = this.data.config.price;
      for (let i = 95; i >= 0; i--) this.data.history.push({ t: now - i * 1800000, price: p });
    }
    this._save();
    // لقطة دورية كل 5 دقائق حتى يبقى الخط حيّاً
    const t = setInterval(() => { this.pushHistory(this.data.config.price, true); this._save(); }, 300000);
    if (t.unref) t.unref();
  }

  _load() {
    try { if (existsSync(this.file)) return JSON.parse(readFileSync(this.file, 'utf8')); } catch (e) { /* corrupt/missing */ }
    return {};
  }
  _save() {
    try { mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(this.file, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  }

  config() { return this.data.config; }
  history(limit = 500) { return this.data.history.slice(-Math.min(Number(limit) || 500, 5000)); }

  // ---- شموع مركزية: تُخزّن وتتطور على السيرفر فيراها كل المستخدمين نفسها ----
  // الشكل التاريخي مأخوذ من شموع BTC الحقيقية (مُقاسة على سعر APX) فيطلع الرسم مثل شارت BTC تماماً.
  // يرجع null إذا لم تصل شموع BTC بعد → عندها لا نثبّت ولا نحفظ شيئاً.
  _seedFromBtc(interval) {
    const btc = this._btcKlines ? this._btcKlines(interval) : null;
    if (!Array.isArray(btc) || !btc.length) return null;
    const n = btc.length;
    const lastClose = parseFloat(btc[n - 1][4]) || 0;
    if (!(lastClose > 0)) return null;
    const price = this.data.config.price;
    const ratio = price / lastClose;
    const bars = [];
    for (let i = 0; i < n; i++) {
      const b = btc[i];
      const o = parseFloat(b[1]) * ratio, hi = parseFloat(b[2]) * ratio, lo = parseFloat(b[3]) * ratio, cl = parseFloat(b[4]) * ratio;
      const vol = (this.data.config.vol / n) * (0.6 + Math.random() * 0.9);
      bars.push([b[0], +o.toFixed(6), +hi.toFixed(6), +lo.toFixed(6), +cl.toFixed(6), +vol.toFixed(2), b[6], +(vol * cl).toFixed(2)]);
    }
    return bars;
  }

  // سلسلة مؤقتة ناعمة (اتجاه تدريجي + مشية صغيرة بلا قفزات) للعرض فقط لحين وصول شموع BTC.
  // لا تُحفظ ولا تُثبّت، فلا تبقى أي قفزة عشوائية في التاريخ.
  _synthSeries(interval) {
    const sec = this.IVSEC[interval] || 900;
    const price = this.data.config.price;
    const ref = (this.data.ref24 > 0) ? this.data.ref24 : price;
    const now = Math.floor(Date.now() / 1000);
    const start = now - (now % sec) - (this.CAP - 1) * sec;
    const amp = price * 0.0015;   // تذبذب صغير ناعم
    const bars = []; let prev = ref;
    for (let i = 0; i < this.CAP; i++) {
      const ot = start + i * sec;
      const frac = i / (this.CAP - 1);
      const trend = ref + (price - ref) * frac;       // انحدار تدريجي نحو السعر الحالي
      let cl = trend + (Math.random() - 0.5) * amp;   // مشية صغيرة حول الاتجاه
      if (i === this.CAP - 1) cl = price;
      const o = prev;
      const hi = Math.max(o, cl) + Math.random() * amp * 0.5;
      let lo = Math.min(o, cl) - Math.random() * amp * 0.5; if (!(lo > 0)) lo = Math.min(o, cl) * 0.999;
      const vol = (this.data.config.vol / this.CAP) * (0.5 + Math.random() * 1.0);
      bars.push([ot * 1000, +o.toFixed(6), +hi.toFixed(6), +lo.toFixed(6), +cl.toFixed(6), +vol.toFixed(2), ot * 1000 + sec * 1000 - 1, +(vol * trend).toFixed(2)]);
      prev = cl;
    }
    return bars;
  }

  // تقديم شموع فاصل زمني واحد: فتح شموع جديدة عند مرور الوقت + تحديث الشمعة الجارية بالسعر الحيّ
  _rollInterval(interval) {
    const sec = this.IVSEC[interval] || 900;
    const bars = this.data.candles[interval];
    if (!Array.isArray(bars) || !bars.length) return;
    const p = this.data.config.price;
    const now = Math.floor(Date.now() / 1000);
    const bucket = now - (now % sec);
    let lastT = Math.floor(bars[bars.length - 1][0] / 1000);
    const vcell = this.data.config.vol / this.CAP;
    while (lastT < bucket) {
      const prevClose = bars[bars.length - 1][4]; lastT += sec;
      bars.push([lastT * 1000, +prevClose.toFixed(6), +prevClose.toFixed(6), +prevClose.toFixed(6), +prevClose.toFixed(6), +vcell.toFixed(2), lastT * 1000 + sec * 1000 - 1, +(vcell * prevClose).toFixed(2)]);
      if (bars.length > this.CAP) bars.shift();
    }
    const cur = bars[bars.length - 1];
    cur[4] = +p.toFixed(6);
    if (p > cur[2]) cur[2] = +p.toFixed(6);
    if (p < cur[3]) cur[3] = +p.toFixed(6);
    if (!(cur[3] > 0)) cur[3] = +(Math.min(cur[1], p) * 0.999).toFixed(6);
  }

  // شموع APX = شموع BTC الحقيقية مقاسة على مستوى سعر APX الحالي → نفس شكل
  // وتذبذب BTC تماماً، وتتحرّك معه لحظياً؛ وعند رفع الأدمن للسعر يرتفع المستوى
  // تدريجياً (لأن cur.price ينتقل تدريجياً) ثم يكمل على حركة BTC.
  _btcScaled(interval) {
    const btc = this._btcKlines ? this._btcKlines(interval) : null;
    if (!Array.isArray(btc) || !btc.length) return null;
    const n = btc.length;
    const lastClose = parseFloat(btc[n - 1][4]) || 1;
    if (!(lastClose > 0)) return null;
    const price = this.data.config.price;
    const ratio = price / lastClose;
    const vcell = (this.data.config.vol || 0) / n;
    const bars = [];
    for (let i = 0; i < n; i++) {
      const b = btc[i];
      let o = parseFloat(b[1]) * ratio, hi = parseFloat(b[2]) * ratio,
          lo = parseFloat(b[3]) * ratio, cl = parseFloat(b[4]) * ratio;
      // آخر شمعة تُغلق على سعر APX الحيّ بالضبط (تطابق الرقم المعروض)
      if (i === n - 1) { cl = price; if (price > hi) hi = price; if (price < lo) lo = price; }
      const vol = vcell * (0.6 + ((i * 2654435761) % 1000) / 1000 * 0.9);
      bars.push([b[0], +o.toFixed(6), +hi.toFixed(6), +lo.toFixed(6), +cl.toFixed(6), +vol.toFixed(2), b[6], +(vol * cl).toFixed(2)]);
    }
    return bars;
  }

  klines(interval, limit = 300) {
    if (!this.IVSEC[interval]) interval = '15m';
    this.data.candles = this.data.candles || {};
    this.data.candlesBtc = this.data.candlesBtc || {};
    const stored = this.data.candles[interval];
    const haveBtcSeed = !!this.data.candlesBtc[interval] && Array.isArray(stored) && stored.length;
    // الشموع تُبذر من شكل BTC الحقيقي فقط، ثم تُثبّت وتُحفظ، وتتحرّك الشمعة
    // الجارية فقط بالسعر الحيّ (الذي يتبع BTC). طالما لم تصل شموع BTC بعد:
    // نعيد سلسلة مؤقتة ناعمة (بلا حفظ ولا تثبيت)، ثم نعيد البذر بشكل BTC
    // الحقيقي حال وصوله — فلا تبقى أي قفزات عشوائية محفوظة بالتاريخ.
    if (!haveBtcSeed) {
      const btcBars = this._seedFromBtc(interval);
      if (btcBars) {
        this.data.candles[interval] = btcBars;
        this.data.candlesBtc[interval] = true;
        this._save();
      } else {
        return this._synthSeries(interval).slice(-Math.min(Number(limit) || 300, this.CAP)).map((b) => b.slice());
      }
    }
    this._rollInterval(interval);
    const now = Date.now();
    if ((now - (this._lastSave || 0)) >= 2000) { this._lastSave = now; this._save(); }
    return this.data.candles[interval].slice(-Math.min(Number(limit) || 300, this.CAP)).map((b) => b.slice());
  }

  // خطوة زمنية واحدة (يناديها السيرفر كل ~ثانية): السعر ينتقل تدريجياً نحو الهدف + تذبذب طبيعي
  tick(arg) {
    const c = this.data.config;
    // يقبل إمّا {price: btcNow} (سعر BTC اللحظي) أو رقم (خطوة قديمة)
    let btcNow = null, step = 0;
    if (arg && typeof arg === 'object') { btcNow = Number(arg.price); }
    else { step = Number(arg) || 0; }
    // تهيئة المرساة إن لزم
    if (this.data.anchorPrice == null || !(this.data.anchorPrice > 0)) {
      this.data.anchorPrice = (this.data.target != null) ? this.data.target : c.price;
    }
    if (btcNow > 0) {
      if (this.data.anchorBtc == null || !(this.data.anchorBtc > 0)) this.data.anchorBtc = btcNow;
      this._lastBtc = btcNow;
      // الهدف يتبع BTC تراكمياً من نقطة المرساة → حركة مستمرة بلا توقف
      const tnew = this.data.anchorPrice * (btcNow / this.data.anchorBtc);
      if (tnew > 0) this.data.target = tnew;
    }
    const tgt = (this.data.target != null && this.data.target > 0) ? this.data.target : c.price;
    // متابعة الهدف 18%/خطوة → استجابة أسرع لتذبذبات BTC اللحظية مع انتقال تدريجي بعد تعديل الأدمن
    let p = c.price + (tgt - c.price) * 0.18;
    // تذبذب حيّ هادئ جداً (±0.03%) → حركة طبيعية مثل BTC
    const noise = (Math.random() - 0.5) * 0.0006;
    this._osc = (this._osc || 0) * 0.9 + noise + step * 0.5;
    if (this._osc > 0.0012) this._osc = 0.0012; if (this._osc < -0.0012) this._osc = -0.0012;
    p = p * (1 + this._osc);
    if (!(p > 0)) p = c.price;
    c.price = +p.toFixed(6);
    const ref = (this.data.ref24 > 0) ? this.data.ref24 : c.price;
    c.chg = (ref > 0) ? +((c.price / ref - 1) * 100).toFixed(2) : c.chg;
    for (const iv in this.data.candles) this._rollInterval(iv);
    this.pushHistory(c.price, false);
    const now = Date.now();
    if ((now - (this._lastSave || 0)) >= 3000) { this._lastSave = now; this._save(); }
    return c;
  }

  pushHistory(price, force) {
    const now = Date.now();
    const last = this.data.history[this.data.history.length - 1];
    const p = Number(price);
    if (!force && last && (now - last.t) < 30000) { if (last) last.price = +p.toFixed(6); return; }
    this.data.history.push({ t: now, price: +p.toFixed(6) });
    if (this.data.history.length > 5000) this.data.history = this.data.history.slice(-5000);
  }

  update(patch = {}) {
    const c = this.data.config;
    if (patch.vol != null && Number(patch.vol) >= 0) c.vol = Number(patch.vol);
    if (patch.supply != null && Number(patch.supply) >= 0) c.supply = Number(patch.supply);
    if (patch.enabled != null) c.enabled = !!patch.enabled;
    // سعر الأدمن: لا نقفز دفعة واحدة — نضبط الهدف والمرساة وينتقل السعر تدريجياً ثم يتبع BTC من المرساة الجديدة
    if (patch.price != null && Number(patch.price) > 0) {
      this.data.target = Number(patch.price);
      this.data.anchorPrice = Number(patch.price);
      this.data.anchorBtc = (this._lastBtc > 0) ? this._lastBtc : this.data.anchorBtc;
    }
    // إذا حدّد الأدمن نسبة التغيّر يدوياً → اضبط مرجع الافتتاح ليطابقها
    if (patch.chg != null && isFinite(Number(patch.chg))) {
      const base = (this.data.target != null) ? this.data.target : c.price;
      const r = base / (1 + Number(patch.chg) / 100);
      if (r > 0) this.data.ref24 = r;
    }
    this._save();
    return c;
  }

  // تنفيذ صفقة APX: لا تؤثر على السعر (السعر يتحكم به الأدمن فقط).
  // نحدّث رصيد المستخدم من APX ونسجّل العملية له + إشعار الأوامر الكبيرة.
  trade({ side, qty, value, email } = {}) {
    const val = Math.abs(Number(value) || 0);
    const q = Math.abs(Number(qty) || 0);
    const c = this.data.config;
    if (!(val > 0) && !(q > 0)) return { ok: false, error: 'bad_value', config: c, holding: this.getHold(email) };
    const dir = (side === 'sell' || side === 'short') ? -1 : 1;
    const px = c.price;
    // لا تأثير على السعر من الصفقات — السعر يتحكم به الأدمن فقط
    const holding = this.addHold(email, dir * q);
    const order = this.addOrder({ email, side: dir < 0 ? 'sell' : 'buy', qty: q, price: px, value: val });
    if (dir > 0 && val >= this.bigOrder) {
      this.data.notifications.unshift({
        id: Date.now() + '' + Math.floor(Math.random() * 1000),
        t: Date.now(), email: String(email || 'guest').slice(0, 120),
        side: 'buy', qty: q, price: px, value: val, read: false,
      });
      if (this.data.notifications.length > 500) this.data.notifications = this.data.notifications.slice(0, 500);
    }
    this._save();
    return { ok: true, config: c, holding, order };
  }

  // ---- أرصدة APX لكل مستخدم (مركزية → تظهر بلوحة الأدمن) ----
  getHold(email) { const e = String(email || '').toLowerCase(); return +(this.data.holdings[e] || 0); }
  addHold(email, dq) {
    const e = String(email || '').toLowerCase(); if (!e) return 0;
    let v = +(this.data.holdings[e] || 0) + Number(dq || 0);
    if (!(v > 0)) v = 0;
    this.data.holdings[e] = +v.toFixed(8);
    this._save();
    return this.data.holdings[e];
  }
  // ضبط رصيد مستخدم من APX لقيمة محددة (إدارة يدوية من لوحة الأدمن)
  setHold(email, qty) {
    const e = String(email || '').toLowerCase(); if (!e) return 0;
    let v = Number(qty); if (!(v > 0)) v = 0;
    this.data.holdings[e] = +v.toFixed(8);
    this._save();
    return this.data.holdings[e];
  }
  holdingsList() {
    const price = this.data.config.price;
    const out = [];
    for (const e in this.data.holdings) {
      const q = +(this.data.holdings[e] || 0);
      if (q > 0) out.push({ email: e, qty: +q.toFixed(8), usdt: +(q * price).toFixed(2) });
    }
    out.sort((a, b) => b.usdt - a.usdt);
    return { price: +price.toFixed(6), items: out };
  }

  // ---- سجل العمليات (Order History) لكل مستخدم ----
  addOrder({ email, side, qty, price, value } = {}) {
    const o = {
      id: Date.now() + '' + Math.floor(Math.random() * 1000),
      t: Date.now(), email: String(email || 'guest').toLowerCase().slice(0, 120),
      side: side === 'sell' ? 'sell' : 'buy',
      qty: +(Number(qty) || 0), price: +(Number(price) || 0), value: +(Number(value) || 0),
    };
    this.data.orders.unshift(o);
    if (this.data.orders.length > 5000) this.data.orders = this.data.orders.slice(0, 5000);
    this._save();
    return o;
  }
  orders({ email, limit = 100 } = {}) {
    const e = String(email || '').toLowerCase();
    let list = this.data.orders;
    if (e) list = list.filter((o) => o.email === e);
    return list.slice(0, Math.min(Number(limit) || 100, 500));
  }

  notify({ side, qty, price, value, email } = {}) {
    const val = Number(value);
    if (!(val > 0)) return { ok: false, error: 'bad_value' };
    if (side === 'buy' && val >= this.bigOrder) {
      this.data.notifications.unshift({
        id: Date.now() + '' + Math.floor(Math.random() * 1000),
        t: Date.now(), email: String(email || 'guest').slice(0, 120),
        side: 'buy', qty: Number(qty) || 0, price: Number(price) || 0, value: val, read: false,
      });
      if (this.data.notifications.length > 500) this.data.notifications = this.data.notifications.slice(0, 500);
      this._save();
    }
    return { ok: true };
  }

  notifications({ unreadOnly = false } = {}) {
    let list = this.data.notifications;
    const unread = list.filter((n) => !n.read).length;
    if (unreadOnly) list = list.filter((n) => !n.read);
    return { items: list.slice(0, 200), unread };
  }

  markRead(ids) {
    this.data.notifications.forEach((n) => { if (!ids || ids.indexOf(n.id) >= 0) n.read = true; });
    this._save();
    return { ok: true };
  }
}
