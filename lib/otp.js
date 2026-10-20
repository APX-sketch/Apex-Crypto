// lib/otp.js
// مخزن رموز OTP عام (بالذاكرة) — يُستخدم لتأكيد السحب ولتسجيل الدخول.
// قابل للاختبار بمعزل (لا يعتمد على Express أو قاعدة البيانات).
//
// الرمز: 6 خانات رقمية، صالح لمدة ttlMs (افتراضي 5 دقائق)، ويُقفل بعد maxTries محاولات خاطئة.

import { randomInt } from 'node:crypto';

export class OtpStore {
  constructor({ ttlMs = 5 * 60 * 1000, maxTries = 5 } = {}) {
    this.ttl = ttlMs;
    this.max = maxTries;
    this._m = new Map();
  }

  _gen() {
    // randomInt آمن تشفيرياً (أفضل من Math.random للرموز)
    return String(randomInt(100000, 1000000));
  }

  // ينشئ رمزاً جديداً للمفتاح (يستبدل أي رمز سابق). meta: بيانات مرافقة (مثل userId).
  issue(key, meta = {}) {
    const code = this._gen();
    this._m.set(String(key), { code, exp: Date.now() + this.ttl, tries: 0, meta });
    return { code, expiresInSec: Math.round(this.ttl / 1000) };
  }

  // يتحقق من الرمز. يُعيد { ok, error?, meta? }. عند النجاح يُستهلك الرمز (مرة واحدة).
  verify(key, code) {
    const k = String(key);
    const r = this._m.get(k);
    if (!r) return { ok: false, error: 'otp_required' };
    if (Date.now() > r.exp) { this._m.delete(k); return { ok: false, error: 'otp_expired' }; }
    if (r.tries >= this.max) { this._m.delete(k); return { ok: false, error: 'otp_locked' }; }
    if (!code || String(code).trim() !== r.code) {
      r.tries += 1;
      return { ok: false, error: 'otp_invalid', triesLeft: Math.max(0, this.max - r.tries) };
    }
    const meta = r.meta;
    this._m.delete(k);
    return { ok: true, meta };
  }

  // يقرأ السجل دون استهلاك (للفحص فقط).
  peek(key) { return this._m.get(String(key)) || null; }

  // حذف يدوي (مثلاً عند الإلغاء).
  clear(key) { this._m.delete(String(key)); }
}
