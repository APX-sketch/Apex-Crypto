export function isMailerConfigured() {
  return true;
}

export async function initMailer() {
  console.log('[mailer] تم تفعيل نظام إرسال Brevo API بنجاح');
  return true;
}

export async function sendMail({ to, subject, text, html }) {
  // جلب المفتاح المباشر من البيئة
  const apiKey = (process.env.BREVO_API_KEY || process.env.SMTP_PASS || '').trim();
  const senderEmail = process.env.MAIL_FROM_EMAIL || 'no-reply@apex-crypto.com';
  const senderName = 'Apex Crypto';

  if (!apiKey) {
    console.error('[mailer] لم يتم العثور على أي مفتاح API في متغيرات البيئة!');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject: subject,
        htmlContent: html || `<p>${text}</p>`,
        textContent: text
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('[mailer] رد Brevo API بالخطأ:', JSON.stringify(data));
      return false;
    }

    console.log(`[mailer] تم إرسال البريد بنجاح إلى (${to}) عبر Brevo API`);
    return true;
  } catch (err) {
    console.error(`[mailer] خطأ أثناء الإرسال إلى (${to}):`, err.message);
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

export async function sendEmailChangeOtp(to, otp) {
  return sendOtp(to, otp);
}

export async function sendTransferAlert(to, details) {
  return sendMail({
    to,
    subject: 'إشعار تحويل - Apex Crypto',
    text: `تفاصيل التحويل: ${details}`,
    html: `<h3>تفاصيل التحويل:</h3><p>${details}</p>`,
  });
}

export function getMailLog() { return []; }
export function getMailStats() { return { total: 0 }; }