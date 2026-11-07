import * as _n38 from 'express';
const express = _n38.default ?? _n38;
import * as supportController from '../controllers/support.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { rateLimit } from '../utils/rateLimit.js';
import { supportAdminOnly } from '../middlewares/supportAdmin.js';
const router = express.Router();

// Guests: rate-limited so the public form can't be abused
const createLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
const trackLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

// Raise a ticket WITHOUT logging in (login page, session expired, etc.)
router.post("/tickets/public", createLimiter, supportController.createTicket);

// Raise a ticket while logged in — automatically linked to the user account
router.post("/tickets", authMiddleware, supportController.createTicket);

// Logged-in user's ticket history
router.get("/tickets/my", authMiddleware, supportController.getMyTickets);

// Public status tracking (needs ticket number + the email used)
router.get("/tickets/track", trackLimiter, supportController.trackTicket);

// ─── Support-team (admin) endpoints ─────────────────────────────────────────
// Access is granted via SUPPORT_ADMIN_EMAILS in .env (BizTrack staff emails)
router.get("/admin/access", authMiddleware, supportAdminOnly, supportController.checkAdminAccess);
router.get("/admin/stats", authMiddleware, supportAdminOnly, supportController.adminGetStats);
router.get("/admin/tickets", authMiddleware, supportAdminOnly, supportController.adminListTickets);
router.get("/admin/tickets/:id", authMiddleware, supportAdminOnly, supportController.adminGetTicket);
router.patch("/admin/tickets/:id/status", authMiddleware, supportAdminOnly, supportController.adminUpdateStatus);
router.post("/admin/tickets/:id/reply", authMiddleware, supportAdminOnly, supportController.adminReply);

export default router;