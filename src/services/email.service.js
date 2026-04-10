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

  return { host, port, secure, auth: { user, pass } };
}

// ─── Shared layout wrapper ───────────────────────────────────────────────────
function wrapLayout({ accentColor, headerBg, headerContent, bodyContent, year }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ClassBridge</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

          <!-- HEADER -->
          <tr>
            <td style="background:${headerBg};padding:0;">
              ${headerContent}
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:40px 48px 32px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="padding:0 48px;">
              <div style="height:1px;background:linear-gradient(to right,transparent,${accentColor}55,transparent);"></div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:24px 48px;text-align:center;">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;letter-spacing:0.5px;">
                &copy; ${year} ClassBridge &nbsp;&bull;&nbsp; All rights reserved
              </p>
              <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:11px;color:#c0c7d0;">
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Credential info block (shared) ─────────────────────────────────────────
function credentialBlock({ url, email, tempPassword, accentColor, bgColor }) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:${bgColor};border-radius:10px;margin:24px 0;overflow:hidden;border:1px solid ${accentColor}22;">
    <tr>
      <td style="padding:20px 24px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="4">
          <tr>
            <td style="font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:${accentColor};font-weight:bold;padding-bottom:12px;">
              Your Login Credentials
            </td>
          </tr>

          <!-- Login URL -->
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid ${accentColor}18;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;width:110px;vertical-align:middle;">Portal URL</td>
                  <td style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;vertical-align:middle;">
                    <a href="${url}" style="color:${accentColor};text-decoration:none;font-weight:600;">${url}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Email -->
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid ${accentColor}18;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;width:110px;vertical-align:middle;">Email</td>
                  <td style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;font-weight:600;vertical-align:middle;">${email}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Password -->
          <tr>
            <td style="padding:8px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;width:110px;vertical-align:middle;">Temp Password</td>
                  <td style="vertical-align:middle;">
                    <span style="font-family:'Courier New',monospace;font-size:15px;font-weight:bold;color:#1f2937;background:${accentColor}14;padding:4px 10px;border-radius:4px;letter-spacing:1.5px;border:1px solid ${accentColor}30;">
                      ${tempPassword}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>`;
}

// ─── Warning chip ────────────────────────────────────────────────────────────
function warningNote(accentColor) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
    <tr>
      <td style="background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:4px;">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#92400e;line-height:1.5;">
          <strong>&#9888; Security reminder:</strong> Change your password immediately after first login.
        </p>
      </td>
    </tr>
  </table>`;
}

// ─── CTA Button ──────────────────────────────────────────────────────────────
function ctaButton({ url, label, accentColor }) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr>
      <td align="center" style="border-radius:8px;background:${accentColor};">
        <a href="${url}"
           style="display:inline-block;padding:14px 36px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.5px;border-radius:8px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}


// ─── STUDENT TEMPLATE ────────────────────────────────────────────────────────
function studentHtml({ to, tempPassword, url, year }) {
  const accent = '#16a34a';
  const headerBg = 'linear-gradient(135deg,#052e16 0%,#14532d 50%,#15803d 100%)';

  const header = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:40px 48px 32px;">
          <!-- Logo mark -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="background:rgba(255,255,255,0.12);border-radius:10px;padding:10px 16px;">
                <span style="font-family:Georgia,serif;font-size:16px;font-weight:bold;color:#ffffff;letter-spacing:1px;">ClassBridge</span>
              </td>
            </tr>
          </table>
          <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:30px;font-weight:bold;color:#ffffff;line-height:1.2;">
            Welcome aboard,<br/>Student! &#127891;
          </h1>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:rgba(255,255,255,0.72);line-height:1.5;">
            Your learning journey starts here.
          </p>
        </td>
      </tr>
    </table>`;

  const body = `
    <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">
      Your student account on <strong style="color:#1f2937;">ClassBridge</strong> has been successfully created.
      Use the credentials below to sign in and start exploring your classes.
    </p>

    ${credentialBlock({ url, email: to, tempPassword, accentColor: accent, bgColor: '#f0fdf4' })}
    ${warningNote(accent)}
    ${ctaButton({ url, label: 'Start Learning →', accentColor: accent })}`;

  return wrapLayout({ accentColor: accent, headerBg, headerContent: header, bodyContent: body, year });
}


// ─── TEACHER TEMPLATE ────────────────────────────────────────────────────────
function teacherHtml({ to, tempPassword, url, year }) {
  const accent = '#1d4ed8';
  const headerBg = 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#1d4ed8 100%)';

  const header = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:40px 48px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="background:rgba(255,255,255,0.12);border-radius:10px;padding:10px 16px;">
                <span style="font-family:Georgia,serif;font-size:16px;font-weight:bold;color:#ffffff;letter-spacing:1px;">ClassBridge</span>
              </td>
            </tr>
          </table>
          <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:30px;font-weight:bold;color:#ffffff;line-height:1.2;">
            Welcome, Educator! &#127979;
          </h1>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:rgba(255,255,255,0.72);line-height:1.5;">
            Your classroom is ready. Let's get started.
          </p>
        </td>
      </tr>
    </table>`;

  const body = `
    <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">
      Your educator account on <strong style="color:#1f2937;">ClassBridge</strong> is live.
      Sign in to manage your batches, host live sessions, and track student progress.
    </p>

    ${credentialBlock({ url, email: to, tempPassword, accentColor: accent, bgColor: '#eff6ff' })}
    ${warningNote(accent)}
    ${ctaButton({ url, label: 'Go to Dashboard →', accentColor: accent })}`;

  return wrapLayout({ accentColor: accent, headerBg, headerContent: header, bodyContent: body, year });
}


// ─── GENERIC TEMPLATE ────────────────────────────────────────────────────────
function genericHtml({ to, tempPassword, url, year }) {
  const accent = '#7c3aed';
  const headerBg = 'linear-gradient(135deg,#1e0a3c 0%,#3b0764 50%,#7c3aed 100%)';

  const header = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:40px 48px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="background:rgba(255,255,255,0.12);border-radius:10px;padding:10px 16px;">
                <span style="font-family:Georgia,serif;font-size:16px;font-weight:bold;color:#ffffff;letter-spacing:1px;">ClassBridge</span>
              </td>
            </tr>
          </table>
          <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:30px;font-weight:bold;color:#ffffff;line-height:1.2;">
            Account Created &#10024;
          </h1>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:rgba(255,255,255,0.72);line-height:1.5;">
            Here are your login credentials.
          </p>
        </td>
      </tr>
    </table>`;

  const body = `
    <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">
      Your <strong style="color:#1f2937;">ClassBridge</strong> account has been set up.
      Use the credentials below to access the platform.
    </p>

    ${credentialBlock({ url, email: to, tempPassword, accentColor: accent, bgColor: '#faf5ff' })}
    ${warningNote(accent)}
    ${ctaButton({ url, label: 'Access ClassBridge →', accentColor: accent })}`;

  return wrapLayout({ accentColor: accent, headerBg, headerContent: header, bodyContent: body, year });
}


// ─── Main export ─────────────────────────────────────────────────────────────
async function sendCredentialEmail({ to, tempPassword, loginUrl, from, role }) {
  try {
    if (!nodemailer) {
      safeLog('Email skipped: nodemailer missing');
      return { skipped: true };
    }
    if (!to || !tempPassword) {
      throw new Error('to and tempPassword are required');
    }

    const transport = nodemailer.createTransport(getTransportOptions());
    const sender = from || process.env.FROM_EMAIL || 'no-reply@classbridge.local';
    const url = loginUrl || process.env.LOGIN_URL || 'https://classbridgeweb.vercel.app/';
    const year = new Date().getFullYear();

    let subject, text, html;

    if (role === 'Student') {
      subject = 'Welcome to ClassBridge — Your Student Account is Ready';
      text = `Hello Student,\n\nWelcome to ClassBridge!\n\nLogin URL: ${url}\nEmail: ${to}\nTemporary Password: ${tempPassword}\n\nPlease change your password immediately after first login.\n\n© ${year} ClassBridge`;
      html = studentHtml({ to, tempPassword, url, year });

    } else if (role === 'Teacher') {
      subject = 'Welcome to ClassBridge — Your Educator Account is Ready';
      text = `Hello Educator,\n\nWelcome to ClassBridge!\n\nLogin URL: ${url}\nEmail: ${to}\nTemporary Password: ${tempPassword}\n\nPlease change your password immediately after first login.\n\n© ${year} ClassBridge`;
      html = teacherHtml({ to, tempPassword, url, year });

    } else {
      subject = 'Your ClassBridge Account Credentials';
      text = `Welcome!\n\nLogin URL: ${url}\nEmail: ${to}\nTemporary Password: ${tempPassword}\n\nPlease change your password immediately after first login.\n\n© ${year} ClassBridge`;
      html = genericHtml({ to, tempPassword, url, year });
    }

    await transport.sendMail({ from: sender, to, subject, text, html });
    return { ok: true };

  } catch (err) {
    console.error('[email] sendCredentialEmail failed:', err?.message ?? err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

module.exports = { sendCredentialEmail };
