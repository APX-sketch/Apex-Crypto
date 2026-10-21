const nodemailer = require('nodemailer');

const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: user,
    pass: pass
  }
});

async function sendMail({ to, subject, text, html }) {
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

module.exports = { sendMail };