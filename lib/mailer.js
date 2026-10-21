// lib/mailer.js
// نظام تنبيهات بريدي فوري للحوالات (إيداع/سحب/تحويل + OTP).
//
// يعمل بثلاث طبقات (من الأقوى للأضعف):
//  1) إذا توفّرت حزمة nodemailer + بيانات البريد → يُرسِل بريداً حقيقياً.
//  2) وإلا → يسجّل الرسالة في ملف outbox (data/mail-outbox.jsonl) للاختبار.
//
// لتفعيل البريد الحقيقي: npm i nodemailer
//
// طريقة (أ) — Gmail (الأسهل):
//   EMAIL_USER=you@gmail.com
//   EMAIL_PASS=xxxxxxxxxxxxxxxx   (App Password من Google — وليس كلمة مرور الحساب)
//
// طريقة (ب) — أي مزوّد SMTP:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
//   (SMTP_SECURE=true لمنفذ 465)

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let _transport = null;
let _ready = null;
let _enabled = false;

// هل أُعدّ البريد الحقيقي؟ (اعتماداً على وجود متغيّرات البيئة فقط).
// تُستخدم من الخادم لتقرير: هل نُظهِر رمز الاختبار (devCode) أم لا.
// عند تفعيل البريد ← لا يُعاد الرمز للواجهة إطلاقاً (يصل للإيميل فقط).
export function isMailerConfigured() {
  const hasGmail = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
  const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  return hasGmail || hasSmtp;
}

function _cfg() {
  const emailUser = process.env.EMAIL_USER || '';
  const emailPass = process.env.EMAIL_PASS || '';
  return {
    // Gmail (الأولوية)
    gmailUser: emailUser,
    gmailPass: emailPass,
    // SMTP عام
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM
      || (emailUser ? ('"Apex Crypto" <' + emailUser + '>') : '')
      || process.env.SMTP_USER
      || 'Apex Crypto <no-reply@apex.local>',
  };
}

// تهيئة كسولة للناقل (تُحاول مرة واحدة فقط).
async function _ensure() {
  if (_ready) return _ready;
  _ready = (async () => {
    const c = _cfg();
    if (!isMailerConfigured()) return; // لا إعداد → استخدم outbox
    try {
      const nm = await import('nodemailer');
      const nodemailer = nm.default || nm;
      if (c.gmailUser && c.gmailPass) {
        // Gmail — يستخدم App Password
        _transport = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: c.gmailUser, pass: c.gmailPass },
        });
        _enabled = true;
        console.log('[mailer] Gmail transport ready (' + c.gmailUser + ')');
      } else {
        _transport = nodemailer.createTransport({
          host: c.host, port: c.port, secure: c.secure,
          auth: { user: c.user, pass: c.pass },
        });
        _enabled = true;
        console.log('[mailer] SMTP transport ready via ' + c.host + ':' + c.port);
      }
    } catch (e) {
      console.warn('[mailer] nodemailer غير مثبّت أو فشل الإعداد (سيُستخدم outbox): ' + e.message);
    }
  })();
  return _ready;
}

let _outboxPath = null;
export function initMailer({ outboxPath } = {}) {
  _outboxPath = outboxPath || null;
  _ensure();
  if (isMailerConfigured()) {
    console.log('[mailer] البريد الحقيقي مُفعّل — ستصل الرموز إلى الإيميل.');
  } else {
    console.log('[mailer] لا توجد إعدادات بريد → وضع الاختبار (outbox + devCode).');
  }
}

function _outbox(entry) {
  if (!_outboxPath) return;
  try {
    mkdirSync(dirname(_outboxPath), { recursive: true });
    appendFileSync(_outboxPath, JSON.stringify({ at: Date.now(), ...entry }) + '\n');
  } catch (e) { /* ignore */ }
}

// إرسال بريد (لا ترمي أبداً — best-effort). تُعيد {ok, mode}.
export async function sendMail({ to, subject, text, html } = {}) {
  if (!to) return { ok: false, mode: 'skip' };
  await _ensure();
  const c = _cfg();
  if (_enabled && _transport) {
    try {
      await _transport.sendMail({ from: c.from, to, subject, text, html: html || undefined });
      return { ok: true, mode: 'smtp' };
    } catch (e) {
      console.warn('[mailer] فشل الإرسال (تسجيل في outbox): ' + e.message);
      _outbox({ to, subject, text, error: e.message });
      return { ok: false, mode: 'error' };
    }
  }
  // لا إعداد بريد: سجّل للمراجعة/الاختبار
  console.log('[mailer:outbox] to=' + to + ' | ' + subject);
  _outbox({ to, subject, text });
  return { ok: true, mode: 'outbox' };
}

// قالب HTML موحّد -----------------------------------------
function _wrap(title, lines) {
  const body = lines.map((l) => '<p style="margin:6px 0;color:#333;font-size:14px">' + l + '</p>').join('');
  return '<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;max-width:520px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden">' +
    '<div style="background:#0b0e11;color:#f0b90b;padding:16px 20px;font-weight:800;font-size:18px">Apex Crypto</div>' +
    '<div style="padding:20px"><h2 style="margin:0 0 10px;font-size:16px;color:#111">' + title + '</h2>' + body + '</div>' +
    '<div style="background:#f7f7f7;color:#999;padding:12px 20px;font-size:11px">هذا بريد آلي — لا تردّ عليه.</div></div>';
}

// تنبيه حوالة (إيداع/سحب/تحويل)
export async function sendTransferAlert({ to, kind, amount, currency, counterparty, delivered } = {}) {
  if (!to) return { ok: false, mode: 'skip' };
  let title, lines;
  if (kind === 'withdraw') {
    title = 'تأكيد عملية سحب';
    lines = ['تم تنفيذ سحب بمبلغ <b>' + amount + ' ' + currency + '</b>.',
      counterparty ? ('الجهة: ' + counterparty) : '',
      delivered ? '✅ وصلت إلى الحساب المستلم.' : 'أُرسِلت إلى عنوان خارجي.'];
  } else if (kind === 'deposit') {
    title = 'إيداع جديد في حسابك';
    lines = ['تم استلام <b>' + amount + ' ' + currency + '</b>.',
      counterparty ? ('من: ' + counterparty) : ''];
  } else {
    title = 'تحويل داخلي';
    lines = ['تم تحويل <b>' + amount + ' ' + currency + '</b>.',
      counterparty ? (counterparty) : ''];
  }
  lines = lines.filter(Boolean);
  const text = title + ' - ' + amount + ' ' + currency + (counterparty ? ' (' + counterparty + ')' : '');
  return sendMail({ to, subject: 'Apex — ' + title, text, html: _wrap(title, lines) });
}

// إرسال رمز OTP (تأكيد سحب أو تسجيل دخول)
export async function sendOtp({ to, code, amount, currency, purpose } = {}) {
  const isLogin = purpose === 'login' || (!amount && !currency);
  const title = isLogin ? 'رمز تسجيل الدخول' : 'رمز تأكيد السحب';
  const intro = isLogin ? 'رمز تأكيد تسجيل دخولك:' : 'رمز تأكيد طلب السحب الخاص بك:';
  const lines = [
    intro,
    '<div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#0b0e11;background:#f0b90b;border-radius:10px;padding:14px;text-align:center;margin:10px 0">' + code + '</div>',
    (amount ? ('المبلغ: <b>' + amount + ' ' + (currency || '') + '</b>') : ''),
    'صالح لمدة 5 دقائق. لا تشاركه مع أحد.',
  ].filter(Boolean);
  const subject = 'Apex — ' + title;
  const text = title + ': ' + code + ' (صالح 5 دقائق)';
  return sendMail({ to, subject, text, html: _wrap(title, lines) });
}
