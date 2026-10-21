// lib/mailer.js
// نظام تنبيهات بريدي فوري للحوالات (إيداع/سحب/تحويل + OTP).
//
// يعمل بثلاث طبقات (من الأقوى للأضعف):
//  1) إذا توفّر حزمة nodemailer + متغيرات SMTP بيئية → يُرسِل بريداً حقيقياً.
//  2) وإلا → يسجّل الرسالة في ملف outbox (data/mail-outbox.jsonl) + طباعة بالكونسول.
//
// لتفعيل البريد الحقيقي: npm i nodemailer
// ثم اضبط المتغيرات: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
//   (SMTP_SECURE=true لمنفذ 465). مثال Gmail: SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_SECURE=true

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let _transport = null;
let _ready = null;
let _enabled = false;

function _cfg() {
  return {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'Apex Crypto <no-reply@apex.local>',
  };
}

// تهيئة دالة الإرسال باستخدام Gmail SMTP مباشرة
async function ensure() {
  if (_ready) return _ready;
  _ready = (async () => {
    try {
      const nm = await import('nodemailer');
      const nodemailer = nm.default || nm;
      
      const user = process.env.EMAIL_USER;
      const pass = process.env.EMAIL_PASS;

      if (user && pass) {
        transport = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: user,
            pass: pass
          }
        });
        _enabled = true;
        console.log('[mailer] Gmail SMTP ready for: ' + user);
      } else {
        console.warn('[mailer] EMAIL_USER or EMAIL_PASS not defined!');
      }
    } catch (e) {
      console.warn('[mailer] Nodemailer failed to load: ' + e.message);
    }
  })();
  return _ready;
}

let _outboxPath = null;
export function initMailer({ outboxPath } = {}) {
  _outboxPath = outboxPath || null;
  _ensure();
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
      console.warn('[mailer] فشل الإرسال عبر SMTP (تسجيل في outbox): ' + e.message);
      _outbox({ to, subject, text, error: e.message });
      return { ok: false, mode: 'error' };
    }
  }
  // لا SMTP: سجّل للمراجعة/الاختبار
  console.log('[mailer:outbox] to=' + to + ' | ' + subject);
  _outbox({ to, subject, text });
  return { ok: true, mode: 'outbox' };
}

// قوالب جاهزة للحوالات -----------------------------------------
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
