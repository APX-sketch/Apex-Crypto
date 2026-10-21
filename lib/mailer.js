import nodemailer from 'nodemailer';

const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: user,
    pass: pass
  }
});

export async function sendMail({ to, subject, text, html }) {
  const mailOptions = {
    from: `"Apex Crypto" <${user}>`,
    to: to,
    subject: subject,
    text: text,
    html: html
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[mailer.success] Email sent: ' + info.response);
    return info;
  } catch (error) {
    console.error('[mailer.error] Error sending email:', error);
    throw error;
  }
}

export function initMailer() {
  console.log('[mailer] Initialized with Gmail SMTP');
}

export async function sendOtp(to, otp) {
  return sendMail({
    to,
    subject: 'رمز تأكيد الدخول - Apex Crypto',
    text: `رمز التحقق الخاص بك هو: ${otp}`,
    html: `<h3>رمز التحقق الخاص بك هو: <b>${otp}</b></h3>`
  });
}

export async function sendTransferAlert(to, details) {
  return sendMail({
    to,
    subject: 'إشعار تحويل - Apex Crypto',
    text: `تم إجراء عملية تحويل بنجاح: ${details}`,
    html: `<p>تم إجراء عملية تحويل بنجاح:</p><p>${details}</p>`
  });
}