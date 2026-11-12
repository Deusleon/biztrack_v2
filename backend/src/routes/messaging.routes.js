// path: backend/routes/messaging.routes.js
import * as _n56 from 'express';
const express = _n56.default ?? _n56;
const router = express.Router();
import * as messagingController from '../controllers/messaging.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { developerOnly } from '../middlewares/developerOnly.js';
import { checkPermission } from '../middlewares/checkPermission.js';
const viewMessaging = checkPermission(["view_messaging", "manage_messaging"]);
const manageMessaging = checkPermission(["manage_messaging"]);
const viewOrManageAccount = checkPermission(["view_messaging", "manage_messaging_account"]);
const manageAccount = checkPermission(["manage_messaging_account"]);
const viewOrManageGroups = checkPermission(["view_messaging", "manage_groups"]);
const manageGroups = checkPermission(["manage_groups"]);
const viewOrManageContacts = checkPermission(["view_messaging", "manage_contacts"]);
const manageContacts = checkPermission(["manage_contacts"]);
const viewOrManageTemplates = checkPermission(["view_messaging", "manage_templates"]);
const manageTemplates = checkPermission(["manage_templates"]);

// Send SMS to one or more numbers
router.post("/send", authMiddleware, manageMessaging, messagingController.sendMessage);

// Delivery stats for one batch
router.get("/batches/:batchId/stats", authMiddleware, viewOrManageAccount, messagingController.getBatchStats);

// Active gateway + what it supports (drives the Account & Top-up screen)
router.get("/gateway-info", authMiddleware, viewOrManageAccount, messagingController.getGatewayInfo);

// Account-wide stats (balance, totals)
router.get("/account-stats", authMiddleware, viewOrManageAccount, messagingController.getAccountStats);

// Ask support to top up SMS credit (gateways that can't be paid via API)
router.post("/topup/request", authMiddleware, manageAccount, messagingController.requestTopup);

// Sent message history
router.get("/history", authMiddleware, viewMessaging, messagingController.getMessageHistory);
router.get("/history/:batchId", authMiddleware, viewMessaging, messagingController.getMessageBatchDetail);

// Sender IDs
router.get("/sender-ids", authMiddleware, developerOnly, viewOrManageAccount, messagingController.listSenderIds);
router.post("/sender-ids", authMiddleware, developerOnly, manageAccount, messagingController.requestSenderId);

// Buy SMS credit
router.get("/wallet/options", authMiddleware, developerOnly, manageAccount, messagingController.getWalletOptions);
router.post("/wallet/quote", authMiddleware, developerOnly, manageAccount, messagingController.quoteWalletTopUp);
router.post("/wallet/topup", authMiddleware, developerOnly, manageAccount, messagingController.createWalletTopUp);
router.get("/wallet/topup/:orderUid", authMiddleware, developerOnly, manageAccount, messagingController.checkWalletTopUp);
router.post("/topup/ussd", authMiddleware, developerOnly, manageAccount, messagingController.buyCreditsUssd);
router.post("/topup/zenopay", authMiddleware, developerOnly, manageAccount, messagingController.createZenoPayOrder);
router.get("/topup/zenopay/status", authMiddleware, developerOnly, viewOrManageAccount, messagingController.checkZenoPayStatus);

// Contact groups & subgroups
router.get("/groups", authMiddleware, viewOrManageGroups, messagingController.listGroups);
router.post("/groups", authMiddleware, manageGroups, messagingController.createGroup);
router.put("/groups/:id", authMiddleware, manageGroups, messagingController.updateGroup);
router.delete("/groups/:id", authMiddleware, manageGroups, messagingController.deleteGroup);

// Contact List — every contact for the store, regardless of group
router.get("/contacts", authMiddleware, viewOrManageContacts, messagingController.listAllContacts);
// Register one contact at a time, optionally straight into a group/subgroup
router.post("/contacts", authMiddleware, manageContacts, messagingController.createContact);
router.put("/contacts/:id", authMiddleware, manageContacts, messagingController.updateContact);
// Replace a contact's full set of group/subgroup memberships in one go
router.put("/contacts/:id/groups", authMiddleware, manageContacts, messagingController.setContactGroups);
router.delete("/contacts/:id", authMiddleware, manageContacts, messagingController.deleteContact);

// Contacts within a group
router.get("/groups/:id/contacts", authMiddleware, viewOrManageGroups, messagingController.listGroupContacts);
router.post("/groups/:id/contacts", authMiddleware, manageGroups, messagingController.addContacts);
// Add existing contacts (picked from the Contact List) to a group
router.post("/groups/:id/assign", authMiddleware, manageGroups, messagingController.assignContactsToGroup);
// Remove a contact from one group only (contact itself isn't deleted)
router.delete("/groups/:groupId/contacts/:contactId", authMiddleware, manageGroups, messagingController.removeContactFromGroup);

// Bulk send to a group (optionally including its subgroups)
router.post("/groups/:id/send", authMiddleware, manageMessaging, messagingController.sendToGroup);

// SMS templates
router.get("/templates", authMiddleware, viewOrManageTemplates, messagingController.listTemplates);
router.post("/templates", authMiddleware, manageTemplates, messagingController.createTemplate);
router.put("/templates/:id", authMiddleware, manageTemplates, messagingController.updateTemplate);
router.delete("/templates/:id", authMiddleware, manageTemplates, messagingController.deleteTemplate);

export default router;