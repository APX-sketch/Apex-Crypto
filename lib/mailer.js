import nodemailer from 'nodemailer';

let _transport = null;
let _enabled = false;

export function isMailerConfigured() {
  const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const hasGmail = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
  return hasSmtp || hasGmail;
}

function _cfg() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
  const from = process.env.MAIL_FROM || user || 'Apex Crypto <no-reply@apex-crypto.com>';
  return { host, port, user, pass, from };
}

export async function initMailer() {
  const cfg = _cfg();
  if (!isMailerConfigured()) {
    console.log('[mailer] لم يتم ضبط إعدادات البريد الإلكتروني');
    _enabled = false;
    return false;
  }

  try {
    if (cfg.host) {
      _transport = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: {
          user: cfg.user,
          pass: cfg.pass,
        },
        connectionTimeout: 10000,
      });
      console.log(`[mailer] تم تهيئة Brevo SMTP بنجاح (${cfg.host})`);
    } else {
      _transport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: cfg.user,
          pass: cfg.pass,
        },
      });
      console.log(`[mailer] تم تهيئة Gmail transport`);
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
    console.log(`[mailer] الإرسال معطل. البريد المستهدف: ${to}`);
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