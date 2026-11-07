import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import sendEmail from '../utils/emailService.js';
import { buildEmailHtml } from '../services/notification.service.js';
import { logActivity } from '../utils/activityLog.js';
import { emitToUser } from '../utils/socket.js';
import { getSupportAdminEmails } from '../middlewares/supportAdmin.js';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || null;
const CATEGORIES = new Set(["bug", "billing", "feature_request", "question", "other"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PUBLIC_TICKET_FIELDS =
  "ticket_number, subject, category, status, created_at, updated_at, resolved_at";

function normalizeContext(raw) {
  if (!raw || typeof raw !== "object") return {};
  // Only accept a small, known set of debug fields from the client
  const context = {};
  for (const key of ["page", "browser", "app_version", "screen"]) {
    if (raw[key] !== undefined && raw[key] !== null && String(raw[key]).length <= 300) {
      context[key] = String(raw[key]);
    }
  }
  return context;
}

/**
 * Shared create handler. Mounted twice:
 *   POST /api/support/tickets         (auth)   -> ticket linked to the user
 *   POST /api/support/tickets/public  (public) -> guest ticket, rate limited
 */
export const createTicket = async (req, res) => {
  const lang = getLang(req);
  const { name, email, phone, category, subject, message, context } = req.body || {};

  // Validation
  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    return res.status(400).json({ success: false, message: t("ticket_fields_required", lang) });
  }
  if (!EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ success: false, message: t("invalid_email", lang) });
  }
  if (subject.trim().length > 200 || message.trim().length > 5000) {
    return res.status(400).json({ success: false, message: t("ticket_too_long", lang) });
  }
  const safeCategory = CATEGORIES.has(category) ? category : "other";

  const userId = req.user?.id || null;
  const storeId = req.user?.current_store_id || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO support_tickets
         (name, email, phone, category, subject, message, user_id, store_id, context, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, created_at`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        phone?.trim() || null,
        safeCategory,
        subject.trim(),
        message.trim(),
        userId,
        storeId,
        JSON.stringify(normalizeContext(context)),
        req.ip || null,
      ],
    );

    const id = inserted.rows[0].id;
    const ticketNumber = `TKT-${String(id).padStart(6, "0")}`;
    await client.query("UPDATE support_tickets SET ticket_number = $1 WHERE id = $2", [
      ticketNumber,
      id,
    ]);

    if (userId) {
      await logActivity(client, {
        userId,
        storeId,
        action: "raise_support_ticket",
        description: { ticket_number: ticketNumber, category: safeCategory, subject: subject.trim() },
        ip: req.ip,
      });
    }

    await client.query("COMMIT");

    // Emails + live staff notifications are best-effort — the ticket exists regardless
    notifySupportTeam({ ticketNumber, name, email, phone, category: safeCategory, subject, message, userId });
    sendConfirmationEmail({ ticketNumber, name, email, subject });
    notifySupportStaffLive({ ticketNumber, name, category: safeCategory, subject });

    return res.status(201).json({
      success: true,
      message: t("ticket_created", lang),
      ticket: { ticket_number: ticketNumber, status: "open", created_at: inserted.rows[0].created_at },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Create support ticket error:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

// Public reply thread for a set of tickets (internal notes excluded)
async function getPublicReplies(ticketIds) {
  if (!ticketIds.length) return {};
  const result = await pool.query(
    `SELECT ticket_id, message, author_name, created_at
     FROM support_ticket_replies
     WHERE ticket_id = ANY($1::int[]) AND is_internal = FALSE
     ORDER BY created_at ASC`,
    [ticketIds],
  );
  const byTicket = {};
  for (const row of result.rows) {
    (byTicket[row.ticket_id] ||= []).push({
      message: row.message,
      author_name: row.author_name || "Support Team",
      created_at: row.created_at,
    });
  }
  return byTicket;
}

// GET /api/support/tickets/my — logged-in user's tickets (by link OR same email)
export const getMyTickets = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, ${PUBLIC_TICKET_FIELDS}
       FROM support_tickets
       WHERE user_id = $1 OR email = LOWER($2)
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id, req.user.email || ""],
    );
    const replies = await getPublicReplies(result.rows.map((row) => row.id));
    const tickets = result.rows.map(({ id, ...ticket }) => ({
      ...ticket,
      replies: replies[id] || [],
    }));
    return res.status(200).json({ success: true, tickets });
  } catch (err) {
    console.error("Get my tickets error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/support/tickets/track?ticket_number=&email= — public status check.
// Requires BOTH the ticket number and the email used to raise it.
export const trackTicket = async (req, res) => {
  const lang = getLang(req);
  const { ticket_number: ticketNumber, email } = req.query || {};
  if (!ticketNumber?.trim() || !email?.trim()) {
    return res.status(400).json({ success: false, message: t("ticket_fields_required", lang) });
  }
  try {
    const result = await pool.query(
      `SELECT id, ${PUBLIC_TICKET_FIELDS}
       FROM support_tickets
       WHERE UPPER(ticket_number) = UPPER($1) AND email = LOWER($2)
       LIMIT 1`,
      [ticketNumber.trim(), email.trim()],
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: t("ticket_not_found", lang) });
    }
    const { id, ...ticket } = result.rows[0];
    const replies = await getPublicReplies([id]);
    return res.status(200).json({ success: true, ticket: { ...ticket, replies: replies[id] || [] } });
  } catch (err) {
    console.error("Track ticket error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ═══ Support-team (admin) endpoints — guarded by supportAdminOnly ═══════════

const TICKET_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);

// GET /api/support/admin/access — lets the frontend know whether to show the
// admin entry point at all
export const checkAdminAccess = async (req, res) => {
  return res.status(200).json({ success: true, allowed: true });
};

// GET /api/support/admin/tickets?status=&category=&search=&page=&limit=
export const adminListTickets = async (req, res) => {
  try {
    const { status, category, search } = req.query;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));

    const params = [];
    let where = "WHERE 1=1";
    if (status && TICKET_STATUSES.has(status)) {
      params.push(status);
      where += ` AND st.status = $${params.length}`;
    }
    if (category && CATEGORIES.has(category)) {
      params.push(category);
      where += ` AND st.category = $${params.length}`;
    }
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      where += ` AND (st.ticket_number ILIKE $${params.length} OR st.subject ILIKE $${params.length} OR st.email ILIKE $${params.length} OR st.name ILIKE $${params.length})`;
    }

    const countParams = [...params];
    params.push(limit, (page - 1) * limit);

    const [listResult, countResult, statsResult] = await Promise.all([
      pool.query(
        `SELECT st.id, st.ticket_number, st.name, st.email, st.phone, st.category,
                st.subject, st.status, st.created_at, st.updated_at, st.resolved_at,
                u.name AS account_name, s.name AS store_name,
                (SELECT COUNT(*)::int FROM support_ticket_replies r WHERE r.ticket_id = st.id) AS reply_count
         FROM support_tickets st
         LEFT JOIN users u  ON u.id = st.user_id
         LEFT JOIN stores s ON s.id = st.store_id
         ${where}
         ORDER BY (st.status = 'open') DESC, st.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM support_tickets st ${where}`, countParams),
      pool.query(
        `SELECT status, COUNT(*)::int AS count FROM support_tickets GROUP BY status`,
      ),
    ]);

    const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const row of statsResult.rows) counts[row.status] = row.count;

    return res.status(200).json({
      success: true,
      tickets: listResult.rows,
      total: countResult.rows[0].total,
      page,
      limit,
      counts,
    });
  } catch (err) {
    console.error("Admin list tickets error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/support/admin/tickets/:id — full detail with the whole thread
export const adminGetTicket = async (req, res) => {
  const lang = getLang(req);
  try {
    const ticketResult = await pool.query(
      `SELECT st.*, u.name AS account_name, u.email AS account_email, s.name AS store_name
       FROM support_tickets st
       LEFT JOIN users u  ON u.id = st.user_id
       LEFT JOIN stores s ON s.id = st.store_id
       WHERE st.id = $1`,
      [req.params.id],
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: t("ticket_not_found", lang) });
    }
    const repliesResult = await pool.query(
      `SELECT id, message, author_name, is_internal, created_at
       FROM support_ticket_replies
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [req.params.id],
    );
    return res.status(200).json({
      success: true,
      ticket: ticketResult.rows[0],
      replies: repliesResult.rows,
    });
  } catch (err) {
    console.error("Admin get ticket error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// PATCH /api/support/admin/tickets/:id/status
export const adminUpdateStatus = async (req, res) => {
  const lang = getLang(req);
  const { status } = req.body || {};
  if (!TICKET_STATUSES.has(status)) {
    return res.status(400).json({ success: false, message: t("invalid_ticket_status", lang) });
  }
  try {
    const result = await pool.query(
      `UPDATE support_tickets
       SET status = $1,
           updated_at = NOW(),
           resolved_at = CASE WHEN $1 IN ('resolved', 'closed') THEN COALESCE(resolved_at, NOW()) ELSE NULL END
       WHERE id = $2
       RETURNING ticket_number, name, email, subject, status`,
      [status, req.params.id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: t("ticket_not_found", lang) });
    }
    const ticket = result.rows[0];

    await logActivity(pool, {
      userId: req.user.id,
      storeId: null,
      action: "update_ticket_status",
      description: { ticket_number: ticket.ticket_number, status },
      ip: req.ip,
    });

    // Tell the user their ticket moved (best-effort)
    if (status === "resolved") {
      sendStatusEmail(ticket, "your_ticket_has_been_resolved_reply_to_this_email_if_the_issue_persists");
    }

    return res.status(200).json({ success: true, ticket });
  } catch (err) {
    console.error("Admin update status error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/support/admin/tickets/:id/reply — { message, is_internal? }
export const adminReply = async (req, res) => {
  const lang = getLang(req);
  const { message, is_internal: isInternal = false } = req.body || {};
  if (!message?.trim()) {
    return res.status(400).json({ success: false, message: t("ticket_fields_required", lang) });
  }
  if (message.trim().length > 5000) {
    return res.status(400).json({ success: false, message: t("ticket_too_long", lang) });
  }
  try {
    const ticketResult = await pool.query(
      "SELECT id, ticket_number, name, email, subject, status FROM support_tickets WHERE id = $1",
      [req.params.id],
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: t("ticket_not_found", lang) });
    }
    const ticket = ticketResult.rows[0];

    const inserted = await pool.query(
      `INSERT INTO support_ticket_replies (ticket_id, message, author_user_id, author_name, is_internal)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, message, author_name, is_internal, created_at`,
      [ticket.id, message.trim(), req.user.id, req.user.name || "Support Team", Boolean(isInternal)],
    );

    // A public reply moves an open ticket into in_progress automatically
    if (!isInternal && ticket.status === "open") {
      await pool.query(
        "UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1",
        [ticket.id],
      );
    } else {
      await pool.query("UPDATE support_tickets SET updated_at = NOW() WHERE id = $1", [ticket.id]);
    }

    await logActivity(pool, {
      userId: req.user.id,
      storeId: null,
      action: "reply_support_ticket",
      description: {
        ticket_number: ticket.ticket_number,
        internal_note: Boolean(isInternal),
      },
      ip: req.ip,
    });

    // Email the reply to the user (never for internal notes; best-effort)
    if (!isInternal) {
      sendReplyEmail(ticket, message.trim(), req.user.name);
    }

    return res.status(201).json({ success: true, reply: inserted.rows[0] });
  } catch (err) {
    console.error("Admin reply error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/support/admin/stats — response-time and volume statistics
export const adminGetStats = async (req, res) => {
  try {
    const [mainResult, categoryResult, statusResult] = await Promise.all([
      pool.query(
        `WITH first_reply AS (
           SELECT ticket_id, MIN(created_at) AS first_reply_at
           FROM support_ticket_replies
           WHERE is_internal = FALSE
           GROUP BY ticket_id
         )
         SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE st.created_at >= NOW() - INTERVAL '7 days')::int  AS last_7_days,
           COUNT(*) FILTER (WHERE st.created_at >= NOW() - INTERVAL '30 days')::int AS last_30_days,
           COUNT(*) FILTER (
             WHERE st.status = 'open' AND st.created_at < NOW() - INTERVAL '24 hours'
           )::int AS open_over_24h,
           AVG(EXTRACT(EPOCH FROM (fr.first_reply_at - st.created_at)))
             FILTER (WHERE fr.first_reply_at IS NOT NULL) AS avg_first_response_seconds,
           AVG(EXTRACT(EPOCH FROM (st.resolved_at - st.created_at)))
             FILTER (WHERE st.resolved_at IS NOT NULL) AS avg_resolution_seconds
         FROM support_tickets st
         LEFT JOIN first_reply fr ON fr.ticket_id = st.id`,
      ),
      pool.query(
        "SELECT category, COUNT(*)::int AS count FROM support_tickets GROUP BY category ORDER BY count DESC",
      ),
      pool.query("SELECT status, COUNT(*)::int AS count FROM support_tickets GROUP BY status"),
    ]);

    const main = mainResult.rows[0];
    const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const row of statusResult.rows) counts[row.status] = row.count;

    return res.status(200).json({
      success: true,
      stats: {
        total: main.total,
        last_7_days: main.last_7_days,
        last_30_days: main.last_30_days,
        open_over_24h: main.open_over_24h,
        avg_first_response_seconds:
          main.avg_first_response_seconds !== null ? Number(main.avg_first_response_seconds) : null,
        avg_resolution_seconds:
          main.avg_resolution_seconds !== null ? Number(main.avg_resolution_seconds) : null,
        counts,
        by_category: categoryResult.rows,
      },
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// Live in-app notification to every staff member (socket user rooms).
// Staff = SUPPORT_ADMIN_EMAILS; offline staff simply miss the socket event
// but still have the email + the queue itself.
async function notifySupportStaffLive({ ticketNumber, name, category, subject }) {
  try {
    const emails = getSupportAdminEmails();
    if (!emails.length) return;
    const staff = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = ANY($1::text[]) AND status = true",
      [emails],
    );
    for (const row of staff.rows) {
      emitToUser(row.id, "supportTicketCreated", {
        ticket_number: ticketNumber,
        subject,
        category,
        from: name,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Support staff live notification failed:", err.message);
  }
}

async function sendReplyEmail(ticket, message, agentName) {
  try {
    await sendEmail({
      to: ticket.email,
      subject: `[${ticket.ticket_number}] Re: ${ticket.subject}`,
      html: buildEmailHtml({
        recipientName: ticket.name,
        title: "support_team_replied",
        message,
        meta: {
          ticket_number: ticket.ticket_number,
          subject: ticket.subject,
          replied_by: agentName || "Support Team",
        },
      }),
    });
  } catch (err) {
    console.error("Reply email failed:", err.message);
  }
}

async function sendStatusEmail(ticket, messageKey) {
  try {
    await sendEmail({
      to: ticket.email,
      subject: `[${ticket.ticket_number}] Ticket ${ticket.status}`,
      html: buildEmailHtml({
        recipientName: ticket.name,
        title: "support_ticket_update",
        message: messageKey,
        meta: { ticket_number: ticket.ticket_number, subject: ticket.subject, status: ticket.status },
      }),
    });
  } catch (err) {
    console.error("Status email failed:", err.message);
  }
}

// ─── Email helpers (best-effort) ─────────────────────────────────────────────

async function notifySupportTeam({ ticketNumber, name, email, phone, category, subject, message, userId }) {
  if (!SUPPORT_EMAIL) return;
  try {
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[${ticketNumber}] New support ticket: ${subject}`,
      html: buildEmailHtml({
        recipientName: "Support Team",
        title: "new_support_ticket",
        message: message,
        meta: {
          ticket_number: ticketNumber,
          category,
          subject,
          from: `${name} <${email}>`,
          phone: phone || undefined,
          account: userId ? "Registered user" : "Guest (not logged in)",
        },
      }),
    });
  } catch (err) {
    console.error("Support team email failed:", err.message);
  }
}

async function sendConfirmationEmail({ ticketNumber, name, email, subject }) {
  try {
    await sendEmail({
      to: email,
      subject: `[${ticketNumber}] We received your support request`,
      html: buildEmailHtml({
        recipientName: name,
        title: "support_ticket_received",
        message:
          "we_received_your_support_request_our_team_will_review_it_and_get_back_to_you_keep_your_ticket_number_for_reference",
        meta: { ticket_number: ticketNumber, subject, status: "Open" },
      }),
    });
  } catch (err) {
    console.error("Ticket confirmation email failed:", err.message);
  }
}

