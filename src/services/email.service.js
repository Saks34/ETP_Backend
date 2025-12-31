const safeLog = (...args) => console.log('[email]', ...args);

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  safeLog('nodemailer not installed. Emails will be skipped. Install with: npm i nodemailer');
}

function getTransportOptions() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP is not configured');
  }

  return {
    host,
    port,
    secure,
    auth: { user, pass },
  };
}

async function sendCredentialEmail({ to, tempPassword, loginUrl, from }) {
  try {
    if (!nodemailer) {
      safeLog('Email skipped: nodemailer missing');
      return { skipped: true };
    }
    if (!to || !tempPassword) {
      throw new Error('to and tempPassword are required');
    }

    const transport = nodemailer.createTransport(getTransportOptions());
    const sender = from || process.env.FROM_EMAIL || 'no-reply@etp.local';
    const url = loginUrl || process.env.LOGIN_URL || 'https://app.etp.local/login';

    const subject = 'Your TeachFlow account credentials';
    const text = `Welcome!\n\nYou can login at: ${url}\nEmail: ${to}\nTemporary password: ${tempPassword}\n\nFor security, please change your password immediately after first login.`;
    const html = `
      <p>Welcome!</p>
      <p>You can login at: <a href="${url}">${url}</a></p>
      <p><strong>Email:</strong> ${to}</p>
      <p><strong>Temporary password:</strong> ${tempPassword}</p>
      <p>For security, please change your password immediately after first login.</p>
    `;

    await transport.sendMail({ from: sender, to, subject, text, html });
    return { ok: true };
  } catch (err) {
    // Safe logging: do not include temp password or credentials
    console.error('[email] sendCredentialEmail failed:', err && err.message ? err.message : err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = { sendCredentialEmail };
