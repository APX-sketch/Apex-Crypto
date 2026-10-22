// ===== نظام إرسال البريد عبر Gmail SMTP (nodemailer) =====
// بديل مباشر لنسخة Brevo — نفس الدوال المُصدَّرة تماماً،
// فقط استبدل الملف واضبط EMAIL_USER و EMAIL_PASS في متغيرات البيئة.
// يتطلّب حزمة nodemailer في package.json.
import nodemailer from 'nodemailer';

let _transport = null;
let _ready = false;

// سجلّ بسيط في الذاكرة لمراقبة نجاح/فشل الإرسال
const _log = [];
function _push(entry) {
  _log.push({ at: Date.now(), ...entry });
  if (_log.length > 500) _log.splice(0, _log.length - 500);
}
function _mask(to) {
  const s = String(to || '');
  const at = s.indexOf('@');
  if (at <= 0) return s ? s[0] + '***' : '';
  const name = s.slice(0, at);
  return (name.length <= 2 ? name[0] : name.slice(0, 2)) + '***' + s.slice(at);
}

export function isMailerConfigured() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

export async function initMailer() {
  if (!isMailerConfigured()) {
    console.warn('[mailer] لا توجد EMAIL_USER / EMAIL_PASS — لن تُرسل الرسائل.');
    return false;
  }
  // Gmail SMTP: 587 STARTTLS (الأنسب لبيئات الاستضافة مثل Render)
  _transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      // كلمة التطبيقات 16 حرفاً (نزيل أي مسافات)
      pass: String(process.env.EMAIL_PASS || '').replace(/\s+/g, ''),
    },
  });
  try {
    await _transport.verify();
    _ready = true;
    console.log('[mailer] تم تفعيل إرسال البريد عبر Gmail SMTP بنجاح.');
    return true;
  } catch (err) {
    _ready = false;
    console.error('[mailer] فشل التحقق من Gmail SMTP:', err.message);
    // نبقي _transport حتى تُجرَّب محاولة الإرسال لاحقاً
    return false;
  }
}

export async function sendMail({ to, subject, text, html, kind } = {}) {
  if (!to) return false;
  if (!isMailerConfigured()) {
    console.error('[mailer] لا يوجد إعداد بريد (EMAIL_USER/EMAIL_PASS).');
    _push({ ok: false, kind: kind || '', to: _mask(to), subject, error: 'no_config' });
    return false;
  }
  if (!_transport) { try { await initMailer(); } catch (e) {} }
  if (!_transport) {
    _push({ ok: false, kind: kind || '', to: _mask(to), subject, error: 'no_transport' });
    return false;
  }
  const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.EMAIL_USER;
  try {
    await _transport.sendMail({
      from: `"Apex Crypto" <${fromEmail}>`,
      to,
      subject,
      text,
      html: html || `<p>${text}</p>`,
    });
    _push({ ok: true, kind: kind || '', to: _mask(to), subject });
    console.log(`[mailer] تم إرسال البريد بنجاح إلى (${_mask(to)})`);
    return true;
  } catch (err) {
    _push({ ok: false, kind: kind || '', to: _mask(to), subject, error: err.message });
    console.error(`[mailer] فشل الإرسال إلى (${_mask(to)}):`, err.message);
    return false;
  }
}

export async function sendOtp(to, otp) {
  return sendMail({
    to,
    kind: 'otp',
    subject: 'رمز تأكيد الدخول - Apex Crypto',
    text: `رمز التحقق الخاص بك هو: ${otp}`,
    html: `<h3>رمز التحقق الخاص بك هو: <b>${otp}</b></h3>`,
  });
}

export async function sendEmailChangeOtp(to, otp) {
  return sendMail({
    to,
    kind: 'email_change_otp',
    subject: 'رمز تغيير البريد - Apex Crypto',
    text: `رمز تأكيد تغيير البريد هو: ${otp}`,
    html: `<h3>رمز تأكيد تغيير البريد هو: <b>${otp}</b></h3>`,
  });
}

export async function sendTransferAlert(to, details) {
  return sendMail({
    to,
    kind: 'transfer',
    subject: 'إشعار تحويل - Apex Crypto',
    text: `تفاصيل التحويل: ${details}`,
    html: `<h3>تفاصيل التحويل:</h3><p>${details}</p>`,
  });
}

export function getMailLog({ limit = 200 } = {}) {
  return _log.slice().reverse().slice(0, Math.max(1, Math.min(500, Number(limit) || 200)));
}

export function getMailStats() {
  const dayAgo = Date.now() - 86400000;
  let sent = 0, failed = 0, last24hFailed = 0, lastError = '';
  for (const e of _log) {
    if (e.ok) sent++; else { failed++; if (e.at >= dayAgo) last24hFailed++; if (!lastError) lastError = e.error || 'unknown'; }
  }
  return { total: _log.length, sent, failed, last24hFailed, lastError, configured: isMailerConfigured() };
}
