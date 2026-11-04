import nodemailer from 'nodemailer';

let transporter;
let testSender;
export function setMailSenderForTests(sender) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Mail test sender is only available in test mode.');
  testSender = sender;
}
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

function getTransporter() {
  const { EMAIL_USER, EMAIL_APP_PASSWORD } = process.env;
  if (!EMAIL_USER || !EMAIL_APP_PASSWORD) throw new Error('Gmail SMTP is not configured');
  if (!transporter) transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false, requireTLS: true,
    auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD },
  });
  return transporter;
}

function frame(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#f3f5f8;font-family:Arial,sans-serif;color:#172338"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#fff;border:1px solid #e1e6ed;border-radius:8px;overflow:hidden"><tr><td style="background:#102341;padding:22px 28px;color:#fff;font-size:18px;font-weight:bold">OUR STARTUP <span style="color:#efbd45">FREELANCER</span><div style="font-size:11px;color:#cad4e1;font-weight:normal;margin-top:5px">Build · Launch · Scale</div></td></tr><tr><td style="padding:28px"><h1 style="font-size:21px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}<p style="font-size:12px;color:#738093;margin:26px 0 0">Our Startup Freelancer</p></td></tr></table></td></tr></table></body></html>`;
}

async function send({ to, subject, title, bodyHtml, text }) {
  if (testSender) return testSender({ to, subject, title, bodyHtml, text });
  const senderName = process.env.EMAIL_FROM_NAME || 'OSF Admin';
  return getTransporter().sendMail({ from: { name: senderName, address: process.env.EMAIL_USER }, to, subject, text, html: frame(title, bodyHtml) });
}

export function sendOtpEmail({ to, contactName, companyName, otp }) {
  const safeName = escapeHtml(contactName); const safeCompany = escapeHtml(companyName);
  return send({ to, subject: 'Verify Your Company Email — OSF', title: 'Verify your company email',
    bodyHtml: `<p>Hello ${safeName},</p><p>Enter this code to verify ${safeCompany} with OSF.</p><p style="font-size:30px;letter-spacing:8px;font-weight:bold;background:#f2f5f8;padding:14px;text-align:center">${otp}</p><p>This code expires in five minutes. Ignore this email if you did not start registration.</p>`,
    text: `Hello ${contactName}, your OSF verification code is ${otp}. It expires in five minutes.` });
}

export function sendSetupEmail({ to, contactName, companyName, userId, setupUrl }) {
  const url = escapeHtml(setupUrl);
  return send({ to, subject: 'Set Up Your OSF Company Account', title: 'Your email is verified',
    bodyHtml: `<p>Hello ${escapeHtml(contactName)},</p><p>The email for ${escapeHtml(companyName)} is verified. Your OSF User ID is <strong>${escapeHtml(userId)}</strong>.</p><p><a href="${url}" style="display:inline-block;background:#183c70;color:#fff;text-decoration:none;padding:12px 18px;border-radius:5px">Set your password</a></p><p>This single-use link expires in 30 minutes.</p>`,
    text: `Your OSF User ID is ${userId}. Set your password using this single-use link (expires in 30 minutes): ${setupUrl}` });
}

export function sendPasswordChangedEmail({ to, contactName, changedAt }) {
  return send({ to, subject: 'Your OSF Account Password Was Changed', title: 'Password changed',
    bodyHtml: `<p>Hello ${escapeHtml(contactName)},</p><p>Your OSF account password was changed on ${escapeHtml(changedAt)}.</p><p>If you did not make this change, contact OSF support.</p>`,
    text: `Your OSF password changed on ${changedAt}. If this was not you, contact OSF support.` });
}
