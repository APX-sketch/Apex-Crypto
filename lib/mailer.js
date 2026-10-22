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

import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

let _transport = null;
let _ready = null;
let _enabled = false;

export function isMailerConfigured() {
  const hasGmail = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
  const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  return hasGmail || hasSmtp;
}

function _cfg() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
  const from = process.env.MAIL_FROM || process.env.EMAIL_USER || user || 'Apex Crypto <no-reply@apex-crypto.com>';

  return { host, port, user, pass, from };
}

export async function initMailer() {
  const cfg = _cfg();
  if (!isMailerConfigured()) {
    console.log('[mailer] لم يتم ضبط إعدادات البريد (لا يوجد SMTP/Gmail env)');
    _enabled = false;
    return false;
  }

  try {
    const nodemailer = (await import('nodemailer')).default;
    
    if (cfg.host) {
      // استخدام Brevo SMTP
      _transport = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: {
          user: cfg.user,
          pass: cfg.pass,
        },
        connectionTimeout: 10000, // 10 ثوانٍ كحد أقصى للاتصال
      });
      console.log(`[mailer] تم تهيئة Brevo SMTP (${cfg.host}:${cfg.port})`);
    } else {
      // استخدام Gmail كخيار بديل
      _transport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: cfg.user,
          pass: cfg.pass,
        },
      });
      console.log(`[mailer] تم تهيئة Gmail transport (${cfg.user})`);
    }

    _enabled = true;
    return true;
  } catch (err) {
    console.error('[mailer.error] فشل تهيئة البريد:', err.message);
    _enabled = false;
    return false;
  }
}

export async function sendMail({ to, subject, text, html }) {
  const cfg = _cfg();
  if (!_enabled || !_transport) {
    console.log(`[mailer] الإرسال معطل أو غير مهيأ. كُتِب الإيميل إلى outbox: ${to}`);
    return false;
  }

  try {
    const info = await _transport.sendMail({
      from: cfg.from,
      to,
      subject,
      text,
      html,
    });
    console.log(`[mailer] تم إرسال البريد بنجاح إلى (${to}):`, info.messageId);
    return true;
  } catch (err) {
    console.error(`[mailer] فشل الإرسال إلى (${to}):`, err.message);
    return false;
  }
}

export async function sendOtp(to, otp) {
  return sendMail({
    to,
    subject: 'رمز تأكيد الدخول - Apex Crypto',
    text: `رمز التحقق الخاص بك هو: ${otp}`,
    html: `<h3>رمز التحقق الخاص بك هو: <b>${otp}</b></h3>`,
  });
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
let _logPath = null;
export function initMailer({ outboxPath, logPath } = {}) {
  _outboxPath = outboxPath || null;
  _logPath = logPath || null;
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

// ---- سجلّ البريد (Logs) — مراقبة نجاح/فشل كل إرسال ----
// يُكتب سطر JSON لكل محاولة إرسال في data/mail-log.jsonl حتى يتمكّن الأدمن
// من مراقبة فشل البريد (سبب الخطأ، المستلم، الموضوع، الوضع، الوقت).
// نُخفي عنوان البريد جزئياً في السجل حفاظاً على الخصوصية.
function _maskEmail(to) {
  const s = String(to || '');
  const at = s.indexOf('@');
  if (at <= 0) return s ? (s[0] + '***') : '';
  const name = s.slice(0, at);
  const dom = s.slice(at);
  const head = name.length <= 2 ? name[0] : name.slice(0, 2);
  return head + '***' + dom;
}
function _mailLog(entry) {
  if (!_logPath) return;
  try {
    mkdirSync(dirname(_logPath), { recursive: true });
    appendFileSync(_logPath, JSON.stringify({ at: Date.now(), ...entry }) + '\n');
  } catch (e) { /* ignore */ }
}

// قراءة آخر سجلّات البريد (للوحة الأدمن). تُعيد الأحدث أولاً.
export function getMailLog({ limit = 200 } = {}) {
  if (!_logPath || !existsSync(_logPath)) return [];
  try {
    const raw = readFileSync(_logPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const out = [];
    for (const ln of lines) { try { out.push(JSON.parse(ln)); } catch (e) {} }
    out.reverse();
    return out.slice(0, Math.max(1, Math.min(2000, Number(limit) || 200)));
  } catch (e) { return []; }
}

// ملخّص إحصائي لسجلّ البريد (إجمالي/ناجح/فاشل + آخر خطأ + فشل آخر 24 ساعة).
export function getMailStats() {
  const all = getMailLog({ limit: 2000 });
  const dayAgo = Date.now() - 86400000;
  let sent = 0, failed = 0, last24hFailed = 0, lastError = '', lastErrorAt = 0;
  for (const e of all) {
    if (e.ok) sent++; else {
      failed++;
      if (e.at >= dayAgo) last24hFailed++;
      if (!lastError) { lastError = e.error || 'unknown'; lastErrorAt = e.at || 0; }
    }
  }
  return { total: all.length, sent, failed, last24hFailed, lastError, lastErrorAt,
    configured: isMailerConfigured() };
}

// إرسال بريد (لا ترمي أبداً — best-effort). تُعيد {ok, mode}.
export async function sendMail({ to, subject, text, html, kind } = {}) {
  if (!to) return { ok: false, mode: 'skip' };
  await _ensure();
  const c = _cfg();
  if (_enabled && _transport) {
    try {
      await _transport.sendMail({ from: c.from, to, subject, text, html: html || undefined });
      _mailLog({ ok: true, mode: 'smtp', kind: kind || '', to: _maskEmail(to), subject });
      return { ok: true, mode: 'smtp' };
    } catch (e) {
      console.warn('[mailer] فشل الإرسال (تسجيل في outbox): ' + e.message);
      _outbox({ to, subject, text, error: e.message });
      _mailLog({ ok: false, mode: 'error', kind: kind || '', to: _maskEmail(to), subject, error: e.message });
      return { ok: false, mode: 'error' };
    }
  }
  // لا إعداد بريد: سجّل للمراجعة/الاختبار
  console.log('[mailer:outbox] to=' + to + ' | ' + subject);
  _outbox({ to, subject, text });
  _mailLog({ ok: true, mode: 'outbox', kind: kind || '', to: _maskEmail(to), subject });
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
  return sendMail({ to, subject: 'Apex — ' + title, text, html: _wrap(title, lines), kind: 'alert:' + (kind || 'transfer') });
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
  return sendMail({ to, subject, text, html: _wrap(title, lines), kind: isLogin ? 'otp:login' : 'otp:withdraw' });
}

// إرسال رمز تأكيد تغيير البريد (يُرسَل إلى البريد الجديد لإثبات ملكيته)
export async function sendEmailChangeOtp({ to, code } = {}) {
  const title = 'تأكيد تغيير البريد الإلكتروني';
  const lines = [
    'طلبت تغيير بريد حسابك إلى هذا العنوان. رمز التأكيد:',
    '<div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#0b0e11;background:#f0b90b;border-radius:10px;padding:14px;text-align:center;margin:10px 0">' + code + '</div>',
    'صالح لمدة 5 دقائق. إن لم تطلب ذلك فتجاهل هذا البريد.',
  ];
  return sendMail({ to, subject: 'Apex — ' + title, text: title + ': ' + code,
    html: _wrap(title, lines), kind: 'otp:change-email' });
    
}
