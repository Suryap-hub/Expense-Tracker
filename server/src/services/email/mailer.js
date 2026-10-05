import nodemailer from 'nodemailer';
import env from '../../config/env.js';
import logger from '../../config/logger.js';

let transporter;
// Emails captured by the "json" transport (used by tests).
export const sentEmails = [];

function getTransporter() {
  if (transporter) return transporter;
  if (env.emailTransport === 'smtp') {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      pool: true,
      maxConnections: 3,
    });
  } else {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export async function sendMail({ to, subject, html, text }) {
  const info = await getTransporter().sendMail({ from: env.EMAIL_FROM, to, subject, html, text });

  if (env.emailTransport === 'json') {
    sentEmails.push({ to, subject, html, text });
  } else if (env.emailTransport === 'console') {
    // Dev mode without SMTP: print the email so links (verify / reset) are usable.
    const link = text.match(/https?:\/\/\S+/)?.[0];
    logger.info(`\n📧 [dev email] to=${to}\n   subject: ${subject}${link ? `\n   link: ${link}` : ''}\n`);
  }
  return info.messageId;
}

export async function verifyMailer() {
  if (env.emailTransport !== 'smtp') {
    logger.warn('SMTP not configured - emails will be printed to the console');
    return;
  }
  try {
    await getTransporter().verify();
    logger.info('SMTP connection verified');
  } catch (err) {
    logger.error({ err: err.message }, 'SMTP verification failed - check SMTP_* variables');
  }
}
