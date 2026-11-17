// lib/loginGuard.js
// حماية دخول على مستوى الحساب (تُطبَّق فوق رمز الـOTP):
//
//   • الرمز صالح 59 ثانية فقط.
//   • 3 محاولات خاطئة على الرمز  → يُلغى الرمز ويُطلب رمز جديد (3 محاولات جديدة).
//   • 3 محاولات خاطئة على الرمز التالي (المجموع 6) → قفل الحساب 24 ساعة.
//
// كل شيء بالذاكرة (زي OtpStore) — وإعادة تشغيل الخادم تصفّر العدّادات.

const MIN = 60 * 1000;

export const LOCK_HOURS = 24;
export const OTP_TTL_MS = 59 * 1000;      // عمر الرمز: 59 ثانية
const MAX_TRIES_PER_CODE = 3;             // 3 أخطاء على الرمز الواحد → رمز جديد
const MAX_FAILS_PER_WINDOW = 3;           // 3 رموز فاشلة متتالية → قفل

export class LoginGuard {
  constructor({ lockMs = LOCK_HOURS * 3600 * 1000 } = {}) {
    this.lockMs = lockMs;
    this._m = new Map();   // email -> { lockUntil, fails, codes, lastAt }
  }

  _rec(email) {
    const k = String(email || '').trim().toLowerCase();
    let r = this._m.get(k);
    if (!r) { r = { lockUntil: 0, fails: 0, codes: 0, lastAt: 0 }; this._m.set(k, r); }
    // انتهت مدة القفل → نصفّر كل شيء
    if (r.lockUntil && Date.now() >= r.lockUntil) { r.lockUntil = 0; r.fails = 0; r.codes = 0; r.lastAt = 0; }
    return r;
  }

  // هل الحساب مقفول الآن؟ يعيد الثواني المتبقية أو 0
  lockedFor(email) {
    const r = this._rec(email);
    if (!r.lockUntil) return 0;
    const left = Math.ceil((r.lockUntil - Date.now()) / 1000);
    return left > 0 ? left : 0;
  }

  // يُستدعى عند كل رمز جديد (أو إعادة إرسال): يبدأ نافذة الـ3 محاولات من جديد
  beginCode(email) {
    const r = this._rec(email);
    r.codes = 0;
    r.lastAt = Date.now();
    return { triesLeft: MAX_TRIES_PER_CODE, codesLeft: MAX_FAILS_PER_WINDOW - r.fails };
  }

  // محاولة خاطئة. يعيد:
  //   { locked:true, retryAfterSec }  → قفل 24 ساعة
  //   { needNewCode:true, triesLeft:0, codesLeft } → تخطّيت حد الرمز، اطلب رمزاً جديداً
  //   { triesLeft, codesLeft } → باقي محاولات
  fail(email) {
    const r = this._rec(email);
    r.codes += 1;
    r.lastAt = Date.now();
    const triesLeft = Math.max(0, MAX_TRIES_PER_CODE - r.codes);
    if (triesLeft > 0) return { triesLeft, codesLeft: MAX_FAILS_PER_WINDOW - r.fails };

    // خلصت محاولات هذا الرمز → نعدّه رمزاً فاشلاً
    r.codes = 0;
    r.fails += 1;
    if (r.fails >= MAX_FAILS_PER_WINDOW) {
      r.lockUntil = Date.now() + this.lockMs;
      r.fails = 0;
      return { locked: true, retryAfterSec: Math.ceil(this.lockMs / 1000), triesLeft: 0, codesLeft: 0 };
    }
    return { needNewCode: true, triesLeft: 0, codesLeft: MAX_FAILS_PER_WINDOW - r.fails };
  }

  // نجاح → تصفير
  success(email) {
    this._m.delete(String(email || '').trim().toLowerCase());
  }
}
