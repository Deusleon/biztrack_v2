import nodemailer from 'nodemailer';
import 'dotenv/config';
import * as _n33 from '@sendgrid/mail';
import pool from '../config/db.js';

const sgMail = _n33.default ?? _n33;
const SENDGRID_KEY = String(process.env.SENDGRID_API_KEY || '');
if (SENDGRID_KEY.startsWith('SG.')) sgMail.setApiKey(SENDGRID_KEY);

const TEST_TIMEOUT_MS = 10000;
const EMAIL_PROVIDER = 'cpanel_smtp';

/** The mailbox saved on Integrations. Inactive or empty settings are ignored. */
async function loadActiveGateway() {
  const { rows } = await pool.query(
    "SELECT config, is_active FROM integrations WHERE provider = $1 AND type = 'email' LIMIT 1",
    [EMAIL_PROVIDER],
  );
  const row = rows[0];
  if (!row?.is_active || !String(row.config?.smtp_host || '').trim()) return null;
  return row.config;
}

export const buildGatewayTransporter = (gateway, { forTest = false } = {}) => nodemailer.createTransport({
  host: String(gateway.smtp_host || '').trim(),
  port: Number(gateway.smtp_port) || 587,
  secure: !!gateway.smtp_secure,
  auth: gateway.smtp_username
    ? { user: String(gateway.smtp_username).trim(), pass: gateway.smtp_password || '' }
    : undefined,
  ...(forTest && { connectionTimeout: TEST_TIMEOUT_MS, greetingTimeout: TEST_TIMEOUT_MS, socketTimeout: TEST_TIMEOUT_MS }),
});

/** purpose "system" uses the system From address when one is set. */
export const gatewayFromAddress = (gateway, fallback = null, purpose = 'user') => {
  const system = purpose === 'system';
  const email = (system && gateway.system_from_email) || gateway.from_email || gateway.smtp_username;
  const name = (system && gateway.system_from_name) || gateway.from_name || 'BizTrack';
  if (!email) return fallback;
  return name ? `"${String(name).replace(/"/g, '')}" <${email}>` : email;
};

/**
 * Why a test failed, as a translation key the screen can show in the selected language.
 * Returns { key, vars }.
 */
export const describeSmtpError = (err, gateway = {}) => {
  const host = gateway.smtp_host || 'mail server';
  const port = Number(gateway.smtp_port) || 587;
  const secure = !!gateway.smtp_secure;
  const code = err?.code;
  const msg = String(err?.message || '');
  const response = Number(err?.responseCode) || 0;
  const vars = { host, port, detail: msg };

  if (code === 'EAUTH' || response === 535 || response === 534 || /invalid login|authentication (failed|unsuccessful)|auth(entication)? .*(rejected|failed)/i.test(msg)) {
    return { key: 'smtp_auth_failed', vars };
  }
  if (code === 'EDNS' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /getaddrinfo (ENOTFOUND|EAI_AGAIN)/i.test(msg)) {
    return { key: 'smtp_host_not_found', vars };
  }
  if (/ECONNREFUSED/.test(msg) || code === 'ECONNREFUSED') {
    return { key: 'smtp_connection_refused', vars };
  }
  if (/wrong version number|ssl3_get_record|SSL routines|packet length too long/i.test(msg) || code === 'ETLS') {
    return { key: secure ? 'smtp_tls_unexpected' : 'smtp_tls_required', vars };
  }
  if (/self[- ]signed|certificate|hostname\/IP does not match|CERT_/i.test(msg)) {
    return { key: 'smtp_certificate', vars };
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'ECONNECTION' || /timeout|timed out|greeting never received|ECONNRESET/i.test(msg)) {
    return { key: 'smtp_timeout', vars };
  }
  if (code === 'EENVELOPE' || response === 550 || response === 553 || response === 554 || /sender|from address|not allowed|relay/i.test(msg)) {
    return { key: 'smtp_from_rejected', vars };
  }
  return { key: 'smtp_unknown', vars };
};

export const verifyEmailGateway = async (gateway) => {
  const transporter = buildGatewayTransporter(gateway, { forTest: true });
  try {
    await transporter.verify();
    return { host: gateway.smtp_host, port: Number(gateway.smtp_port) || 587 };
  } finally {
    transporter.close();
  }
};

export const sendGatewayTestEmail = async (gateway, to, purpose = 'user') => {
  const transporter = buildGatewayTransporter(gateway, { forTest: true });
  try {
    const from = gatewayFromAddress(gateway, null, purpose);
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'BizTrack email test',
      text: 'This is a test message from BizTrack. If you are reading it, the mailbox settings work. No action is needed.',
      html: '<div style="font-family:Arial,sans-serif;max-width:600px"><h3>BizTrack email test</h3><p>If you are reading this, the mailbox settings work. No action is needed.</p></div>',
    });
    if (info.rejected?.length) {
      const error = new Error(`The mail server rejected ${info.rejected.join(', ')}.`);
      error.code = 'EENVELOPE';
      throw error;
    }
    return { messageId: info.messageId, from };
  } finally {
    transporter.close();
  }
};

async function sendViaGateway(gateway, { to, subject, html, purpose }) {
  const transporter = buildGatewayTransporter(gateway);
  try {
    const info = await transporter.sendMail({
      from: gatewayFromAddress(gateway, null, purpose),
      to,
      subject,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('SMTP send error:', error.message);
    return { success: false, error: error.message };
  } finally {
    transporter.close();
  }
}

async function sendViaSendGrid({ to, subject, html }) {
  if (!SENDGRID_KEY.startsWith('SG.') || !process.env.EMAIL_FROM) {
    return { success: false, error: 'Email is not configured.' };
  }
  try {
    const [response] = await sgMail.send({
      to,
      from: { email: process.env.EMAIL_FROM, name: 'BizTrack' },
      subject,
      html,
    });
    return { success: true, messageId: response.headers?.['x-message-id'] };
  } catch (error) {
    console.error('Email sending error:', error.response?.body || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sends one email. An active cPanel mailbox on the Integrations page is used first.
 * SendGrid is the fallback when that mailbox is not active.
 */
const sendEmail = async ({ to, subject, html, purpose = 'user' }) => {
  try {
    const gateway = await loadActiveGateway();
    if (gateway) return await sendViaGateway(gateway, { to, subject, html, purpose });
    return await sendViaSendGrid({ to, subject, html });
  } catch (error) {
    console.error('Email sending error:', error.message);
    return { success: false, error: error.message };
  }
};

export default sendEmail;
