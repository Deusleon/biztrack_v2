import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import sendEmail from '../utils/emailService.js';
import * as smsService from '../utils/smsService.js';
import { emitInAppNotification } from '../utils/socket.js';
const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  inapp_low_stock: true,
  inapp_new_sale: true,
  inapp_payment_due: true,
  inapp_purchase_received: true,
  inapp_stock_transfer: true,
  inapp_sales_return: true,
  inapp_stock_adjustment: true,
  inapp_new_user: true,
  inapp_user_activity: true,
  inapp_cloud_backup: true,
  inapp_daily_summary: false,
  inapp_subscription_expiring: false,

  email_low_stock: false,
  email_new_sale: false,
  email_payment_due: false,
  email_purchase_received: false,
  email_stock_transfer: false,
  email_sales_return: false,
  email_stock_adjustment: false,
  email_new_user: false,
  email_user_activity: false,
  email_cloud_backup: false,
  email_daily_summary: false,
  email_subscription_expiring: false,

  sms_low_stock: false,
  sms_new_sale: false,
  sms_payment_due: false,
  sms_sales_return: false,
  sms_purchase_received: false,
  sms_stock_transfer: false,
  sms_stock_adjustment: false,
  sms_new_user: false,
  sms_cloud_backup: false,
  sms_user_activity: false,
  sms_daily_summary: false,
  sms_subscription_expiring: false,
});

const EMAIL_BRAND = Object.freeze({
  name: "BizTrack",
  primary: "#1E3A5F", // matches the PDF report navy
  accent: "#2563EB",
  text: "#374151",
  heading: "#111827",
  muted: "#6B7280",
  faint: "#9CA3AF",
  border: "#E5E7EB",
  bg: "#F3F4F6",
});

function humanize(value = "") {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getNotificationSettings(storeId, db = pool) {
  const result = await db.query(
    "SELECT settings FROM store_settings WHERE store_id = $1 LIMIT 1",
    [storeId],
  );
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(result.rows[0]?.settings?.notifications || {}),
  };
}

async function getRecipients(storeId, { roles, recipientUserIds, excludeUserId } = {}, db = pool) {
  const params = [storeId];
  let where = "su.store_id = $1 AND su.status = true AND u.status = true";

  if (Array.isArray(roles) && roles.length) {
    params.push(roles);
    where += ` AND r.name = ANY($${params.length}::text[])`;
  }
  if (Array.isArray(recipientUserIds) && recipientUserIds.length) {
    params.push(recipientUserIds);
    where += ` AND u.id = ANY($${params.length}::uuid[])`;
  }
  if (excludeUserId) {
    params.push(excludeUserId);
    where += ` AND u.id <> $${params.length}`;
  }

  const result = await db.query(
    `SELECT DISTINCT u.id, u.name, u.email, u.phone, u.preferred_language, r.name AS role_name
     FROM store_users su
     JOIN users u ON u.id = su.user_id
     JOIN roles r ON r.id = su.role_id
     WHERE ${where}`,
    params,
  );
  return result.rows;
}

/**
 * Professional, email-client-safe notification email.
 *
 * Table-based layout with inline styles only — required for Outlook,
 * Gmail, and most mobile clients (divs with margin:auto break there).
 *
 * Optional extras:
 *   actionUrl / actionLabel -> renders a call-to-action button
 *   footerNote              -> overrides the default footer sentence
 */
function buildEmailHtml({
  recipientName,
  title,
  message,
  meta,
  actionUrl = null,
  actionLabel = "View Details",
  footerNote = null,
}) {
  const B = EMAIL_BRAND;
  const safeTitle = escapeHtml(humanize(title));
  const plain = String(message || "");
  const safeMessage = escapeHtml(plain).replace(/\n/g, "<br>");
  const safeName = escapeHtml(recipientName || "there");
  const year = new Date().getFullYear();

  // Preheader: the preview line shown next to the subject in the inbox.
  const preheader = `
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
      ${escapeHtml(plain.replace(/\s+/g, " ").slice(0, 140))}
    </div>`;

  const metaEntries = Object.entries(meta || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 8);

  const metaRows = metaEntries
    .map(
      ([key, value], index) => `
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:${B.muted};border-bottom:${index === metaEntries.length - 1 ? "none" : `1px solid ${B.border}`};white-space:nowrap;">
          ${escapeHtml(humanize(key))}
        </td>
        <td align="right" style="padding:10px 16px;font-size:13px;color:${B.heading};font-weight:600;border-bottom:${index === metaEntries.length - 1 ? "none" : `1px solid ${B.border}`};">
          ${escapeHtml(value)}
        </td>
      </tr>`,
    )
    .join("");

  const metaTable = metaRows
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="border-collapse:separate;border:1px solid ${B.border};border-radius:8px;background:#FFFFFF;margin:20px 0 0;">
        ${metaRows}
      </table>`
    : "";

  // "Bulletproof" button: renders in Outlook (table-based) and everywhere else.
  const actionButton = actionUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
        <tr>
          <td align="center" bgcolor="${B.accent}" style="border-radius:6px;">
            <a href="${escapeHtml(actionUrl)}" target="_blank"
               style="display:inline-block;padding:11px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;">
              ${escapeHtml(actionLabel)}
            </a>
          </td>
        </tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:${B.bg};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${B.bg};">
    <tr>
      <td align="center" style="padding:32px 12px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="width:600px;max-width:100%;background:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid ${B.border};">

          <!-- Header -->
          <tr>
            <td bgcolor="${B.primary}" style="padding:22px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#FFFFFF;letter-spacing:0.5px;">
                    ${B.name}
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#C7D2E0;">
                    Notification
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:${B.text};">
              <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">
                Hello ${safeName},
              </p>

              <h1 style="margin:0 0 10px;font-size:19px;line-height:1.35;color:${B.heading};">
                ${safeTitle}
              </h1>

              <p style="margin:0;font-size:14px;line-height:1.7;color:${B.text};">
                ${safeMessage}
              </p>

              ${metaTable}
              ${actionButton}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="border-top:1px solid ${B.border};font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${B.faint};">
                ${footerNote ? escapeHtml(footerNote) : "You are receiving this email according to your store notification settings. You can adjust which notifications you receive from your BizTrack settings."}
              </p>
              <p style="margin:0;font-size:12px;color:${B.faint};">
                &copy; ${year} ${B.name}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>

        <!-- Sub-footer outside the card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
          <tr>
            <td align="center" style="padding:16px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${B.faint};">
              This is an automated message &mdash; please do not reply directly to this email.
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Dispatch a store event through every enabled channel.
 * The store's notification keys use the pattern <channel>_<type>.
 *
 * Optional: actionUrl/actionLabel add a call-to-action button to the email.
 */
function fitSms(text) {
  const clean = String(text || "").replace(/\r/g, "");
  return clean.length > 306 ? `${clean.slice(0, 303)}...` : clean;
}

async function notifyStore({
  storeId,
  type,
  title,
  message,
  emailMessage,
  smsMessage,
  localize,
  meta = {},
  roles,
  recipientUserIds,
  excludeUserId,
  channels = ["inapp", "email", "sms"],
  actionUrl = null,
  actionLabel = undefined,
}) {
  if (!storeId || !type) return { skipped: true, reason: "missing_store_or_type" };

  const settings = await getNotificationSettings(storeId);
  const enabledChannels = channels.filter((channel) => settings[`${channel}_${type}`] === true);
  if (!enabledChannels.length) return { skipped: true, reason: "disabled_by_settings" };

  const result = { inapp: false, email: { sent: 0, failed: 0 }, sms: { sent: 0, failed: 0 } };

  const needsPeople = enabledChannels.includes("email") || enabledChannels.includes("sms") || (enabledChannels.includes("inapp") && typeof localize === "function");
  let recipients = [];
  if (needsPeople) {
    recipients = await getRecipients(storeId, { roles, recipientUserIds, excludeUserId });
    if (Array.isArray(roles) && roles.length && recipients.length === 0 && !recipientUserIds) {
      recipients = await getRecipients(storeId, { excludeUserId });
    }
  }

  if (enabledChannels.includes("inapp")) {
    const local = recipients[0] && typeof localize === "function" ? localize(recipients[0]) || {} : {};
    await emitInAppNotification(storeId, type, { title: local.title || title, message: local.sms || message, meta });
    result.inapp = true;
  }

  if (enabledChannels.includes("email") || enabledChannels.includes("sms")) {
    if (enabledChannels.includes("email")) {
      const emailRecipients = recipients.filter((recipient) => recipient.email);
      const deliveries = await Promise.allSettled(
        emailRecipients.map((recipient) => {
          const local = typeof localize === "function" ? localize(recipient) || {} : {};
          const emailTitle = local.title || title || type;
          const emailBody = local.email || emailMessage || message || title || type;
          return sendEmail({
            to: recipient.email,
            subject: `BizTrack: ${humanize(emailTitle)}`,
            html: buildEmailHtml({
              recipientName: recipient.name,
              title: emailTitle,
              message: emailBody,
              meta,
              actionUrl,
              actionLabel,
            }),
          });
        }),
      );
      deliveries.forEach((delivery) => {
        const succeeded = delivery.status === "fulfilled" && delivery.value?.success !== false;
        result.email[succeeded ? "sent" : "failed"] += 1;
      });
    }

    if (enabledChannels.includes("sms")) {
      const smsRecipients = recipients.filter((recipient) => recipient.phone);

      const deliveries = await Promise.allSettled(
        smsRecipients.map((recipient) => {
          const local = typeof localize === "function" ? localize(recipient) || {} : {};
          const smsText = fitSms(local.sms || smsMessage || message || title || type);
          return smsService.send(recipient.phone, smsText, { storeId, purpose: "system" });
        }),
      );

      deliveries.forEach((delivery) => {
        const succeeded =
          delivery.status === "fulfilled" &&
          delivery.value?.success === true;

        result.sms[succeeded ? "sent" : "failed"] += 1;
      });
    }
  }

  return result;
}

export { DEFAULT_NOTIFICATION_SETTINGS, getNotificationSettings, notifyStore, buildEmailHtml };

