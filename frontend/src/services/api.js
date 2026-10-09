// FILE PATH: frontend/src/services/api.js
/**
 * Every call the app makes to the server goes through here, one service object per module — the same
 * shape as EduTrack's services. BizTrack's server answers with its own bodies ({ categories, pagination },
 * { customer }, …); these helpers turn them into ONE contract every page can rely on:
 *
 *   lists   → { success: true, data: [...], pagination: { currentPage, totalPages, totalItems, limit }, message }
 *   one row → { success: true, data: {...}, message }
 *   actions → { success: true, message }
 *
 * Failures are thrown by utils/api.js as an object with a readable `.message`.
 */
import api from '../utils/api';

const lang = () => { try { return window.__auth_user?.preferred_language || localStorage.getItem('lang') || 'en'; } catch { return 'en'; } };

/** Store the person is working in (set by StoreContext). Most BizTrack routes carry it in the URL. */
export const currentStoreId = () => localStorage.getItem('currentStoreId');

const pageOf = (p = {}) => ({
  currentPage: p.page ?? 1,
  totalPages: p.totalPages ?? 1,
  totalItems: p.total ?? 0,
  limit: p.limit ?? 25,
});

/** Wrap a server body that holds a list under `key` (and optionally a `pagination` block). */
const asList = (res, key) => ({
  success: true,
  message: res.message,
  data: res[key] ?? [],
  // Some lists are not paged by the server (price categories): then everything came back on one page.
  pagination: res.pagination ? pageOf(res.pagination) : { currentPage: 1, totalPages: 1, totalItems: (res[key] ?? []).length, limit: (res[key] ?? []).length || 25 },
  ...(res.summary ? { summary: res.summary } : {}),
  raw: res,
});
const asOne = (res, key) => ({ success: true, message: res.message, data: res[key] ?? null, raw: res });
const asDone = (res) => ({ success: true, message: res.message, raw: res });

// ─── auth ─────────────────────────────────────────────────────────────────────────────────────────
export const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (data) => api.post('/auth/register', data),
  verifyEmail: (data) => api.post('/auth/verify-email', data),
  resendEmail: (data) => api.post('/auth/resend-email', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  verifyResetLink: (params) => api.get('/auth/reset-password/verify', { params }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  verifyPassword: (data) => api.post('/auth/verify-password', data),
  logout: async () => { try { return await api.post('/auth/logout', {}); } catch { return { message: '' }; } },
  /** Role + permissions of the signed-in person in another store; returns { storeInfo, permissions, token, security }. */
  switchStore: (storeId) => api.post('/auth/switch-store', { store_id: storeId }),
  /** Permissions of the signed-in person in the current store. */
  getPermissions: async () => { const res = await api.get('/user/permissions'); return { success: true, data: res.permissions || [] }; },
};

// ─── profile (the signed-in person) ───────────────────────────────────────────────────────────────
export const profileService = {
  get: async () => { const res = await api.get('/profile'); return { success: true, data: res.profile, raw: res }; },
  update: (data) => api.put('/profile', data),
  /** Resolves with { message, token, security } — the token is fresh, because the old ones stop working. */
  changePassword: (data) => api.put('/profile/password', data),
  /** The picture is uploaded to Cloudinary by the page first; the server only keeps its address. */
  setAvatar: (avatar_url, public_id) => api.post('/profile/avatar', { avatar_url, public_id }),
  removeAvatar: () => api.delete('/profile/avatar'),
};

// ─── stores ───────────────────────────────────────────────────────────────────────────────────────
export const storeService = {
  getMine: async () => { const res = await api.get('/stores'); return { success: true, data: res.stores || [], raw: res }; },
  getDefault: async () => { const res = await api.get('/stores/default'); return { success: true, data: res.store || null, raw: res }; },
  create: async (data) => asOne(await api.post('/stores', data), 'store'),
  update: async (id, data) => asOne(await api.put(`/stores/${id}`, data), 'store'),
  remove: async (id, password) => asDone(await api.post(`/stores/${id}/delete`, { password })),
};

// ─── product categories ───────────────────────────────────────────────────────────────────────────
export const categoryService = {
  getAll: async (params = {}) => asList(await api.get(`/categories/${params.storeId || currentStoreId()}`, { params: { page: params.page, limit: params.limit, search: params.search } }), 'categories'),
  create: async (data) => asOne(await api.post('/categories', { ...data, storeId: data.storeId || currentStoreId() }), 'category'),
  update: async (id, data) => asOne(await api.put(`/categories/${id}`, { ...data, storeId: data.storeId || currentStoreId() }), 'category'),
  remove: async (id) => asDone(await api.delete(`/categories/${id}`, { data: { storeId: currentStoreId() } })),
};

// ─── price categories (customer types: wholesale, retail…) ───────────────────────────────────────
export const priceCategoryService = {
  getAll: async (params = {}) => asList(await api.get(`/price-categories/${params.storeId || currentStoreId()}`), 'priceCategories'),
  create: async (data) => asOne(await api.post('/price-categories', { ...data, storeId: data.storeId || currentStoreId() }), 'priceCategory'),
  update: async (id, data) => asOne(await api.put(`/price-categories/${id}`, { ...data, storeId: data.storeId || currentStoreId() }), 'priceCategory'),
  remove: async (id) => asDone(await api.delete(`/price-categories/${id}`, { data: { storeId: currentStoreId() } })),
};

// ─── customers ────────────────────────────────────────────────────────────────────────────────────
export const customerService = {
  getAll: async (params = {}) => asList(await api.get(`/customers/${params.storeId || currentStoreId()}`, { params: { page: params.page, limit: params.limit, search: params.search } }), 'customers'),
  create: async (data) => asOne(await api.post('/customers', { ...data, storeId: data.storeId || currentStoreId() }), 'customer'),
  update: async (id, data) => asOne(await api.put(`/customers/${id}`, { ...data, storeId: data.storeId || currentStoreId() }), 'customer'),
  remove: async (id) => asDone(await api.delete(`/customers/${id}`)),
};

// ─── products ─────────────────────────────────────────────────────────────────────────────────────
export const productService = {
  getAll: async (params = {}) => asList(await api.get(`/products/${params.storeId || currentStoreId()}`, { params: { page: params.page, limit: params.limit, search: params.search } }), 'products'),
  getByBarcode: async (barcode) => asOne(await api.get(`/products/${currentStoreId()}/barcode/${encodeURIComponent(barcode)}`), 'product'),
  create: async (data) => asOne(await api.post('/products', { ...data, storeId: data.storeId || currentStoreId() }), 'product'),
  update: async (id, data) => asOne(await api.put(`/products/${id}`, { ...data, storeId: data.storeId || currentStoreId() }), 'product'),
  remove: async (id) => asDone(await api.delete(`/products/${id}`)),
  /** Several ids at once. */
  removeMany: async (ids) => { const out = []; for (const id of ids) out.push(await api.delete(`/products/bulk/${id}`)); return { success: true, message: out[out.length - 1]?.message }; },
};

// ─── sales (POS, pending orders, history, returns, credit/debits) ───────────────────────────────────
// The server's own bodies are passed through as-is (the pages need fields like invoice_number, order_number, items…);
// only the list endpoints that page get the normalized { data, pagination } shape.
export const salesService = {
  /** Products with the price of one price category (POS when a category is chosen). */
  productsWithPrices: (params = {}) => api.get('/pricelist', { params: { priceCategoryId: params.priceCategoryId, page: params.page || 1, limit: params.limit || 500, search: params.search || '', expandBatches: params.expandBatches || false } }),
  addToCartByBarcode: (payload) => api.post('/sales/cart-by-barcode', { storeId: currentStoreId(), ...payload }),
  getActiveCart: () => api.get('/sales/active-cart'),
  syncActiveCart: (payload) => api.post('/sales/sync-cart', payload),
  /** cash / credit sale → { invoice_number, payment_id, items… } */
  recordSale: (payload) => api.post('/sales/sell-cart', { storeId: currentStoreId(), ...payload }),
  saveDraftOrder: (payload) => api.post('/sales/save-order', { storeId: currentStoreId(), ...payload }),
  saveOrderChanges: (payload) => api.post('/sales/save-order-changes', { storeId: currentStoreId(), ...payload }),
  // pending orders
  /** status: 'Saved' (default, waiting orders) or 'Cancelled' */
  getPendingOrders: (status) => api.get('/sales/get-orders', { params: status ? { status } : undefined }),
  getOrder: (code) => api.get(`/sales/get-orders/${encodeURIComponent(code)}`),
  getOrderForEdit: (code) => api.get(`/sales/edit-orders/${encodeURIComponent(code)}`),
  recordOrderPayments: (payload) => api.post('/sales/order-payments', payload),
  cancelOrder: (code, note) => api.put(`/sales/orders/${encodeURIComponent(code)}/cancel`, note ? { note } : {}),
  reopenOrder: (code) => api.put(`/sales/orders/${encodeURIComponent(code)}/reopen`),
  deleteOrder: (code) => api.delete(`/sales/orders/${encodeURIComponent(code)}`),
  sellOrder: (code) => api.post(`/sales/orders/${encodeURIComponent(code)}/sell`),
  // history
  history: (params = {}) => api.get('/sales/history', { params }),
  saleDetails: (invoiceNumber) => api.get(`/sales/history/${encodeURIComponent(invoiceNumber)}`),
  // returns
  createReturn: (payload) => api.post('/sales/returns', payload),
  returns: (params = {}) => api.get('/sales/returns', { params }),
  returnDetails: (id) => api.get(`/sales/returns/${id}`),
  approveReturn: (id) => api.post(`/sales/returns/${id}/approve`),
  rejectReturn: (id, reason) => api.post(`/sales/returns/${id}/reject`, { reason }),
  // credit sales (debits)
  credit: (params = {}) => api.get('/sales/credit', { params }),
  creditDetails: (id) => api.get(`/sales/credit/${id}`),
  recordCreditPayment: (id, payload) => api.post(`/sales/credit/${id}/payment`, payload),
  notifyCredit: (id, payload) => api.post(`/sales/credit/${id}/notify`, payload),
  markOverdue: () => api.post('/sales/credit/mark-overdue'),
};

// ─── suppliers ─────────────────────────────────────────────────────────────────────────────────────
export const supplierService = {
  getAll: async (params = {}) => asList(await api.get(`/suppliers/${params.storeId || currentStoreId()}`, { params: { page: params.page, limit: params.limit, search: params.search } }), 'suppliers'),
  create: async (data) => asOne(await api.post('/suppliers', { ...data, storeId: data.storeId || currentStoreId() }), 'supplier'),
  update: async (id, data) => asOne(await api.put(`/suppliers/${id}`, { ...data, storeId: data.storeId || currentStoreId() }), 'supplier'),
  remove: async (id) => asDone(await api.delete(`/suppliers/${id}`)),
};

// ─── purchases (orders, goods received, supplier invoices / payments / returns) ─────────────────────
// Every purchase endpoint already answers { success, data, pagination: { page, limit, total, … } }.
const pList = (res) => ({ success: true, message: res.message, data: res.data ?? [], pagination: pageOf(res.pagination), raw: res });
const pOne = (res) => ({ success: true, message: res.message, data: res.data ?? null, raw: res });
const crud = (base) => ({
  list: async (params = {}) => pList(await api.get(base, { params })),
  get: async (id) => pOne(await api.get(`${base}/${id}`)),
  create: async (data) => pOne(await api.post(base, data)),
  update: async (id, data) => pOne(await api.put(`${base}/${id}`, data)),
  remove: async (id) => asDone(await api.delete(`${base}/${id}`)),
});
export const purchaseService = {
  orders: {
    ...crud('/purchases/orders'),
    approve: async (id, approval_status, rejection_reason) => asDone(await api.post(`/purchases/orders/${id}/approve`, { approval_status, rejection_reason })),
    activeCart: () => api.get('/purchases/active-cart'),
    syncCart: (payload) => api.post('/purchases/sync-cart', payload),
  },
  grn: { ...crud('/purchases/grn'), inspect: async (id, payload) => asDone(await api.post(`/purchases/grn/${id}/inspect`, payload)) },
  invoices: crud('/purchases/invoices'),
  payments: crud('/purchases/payments'),
  returns: { ...crud('/purchases/returns'), approve: async (id) => asDone(await api.post(`/purchases/returns/${id}/approve`)) },
  dashboard: (params) => api.get('/purchases/dashboard', { params }),
  statement: (supplierId, params) => api.get(`/purchases/supplier/${supplierId}/statement`, { params }),
};

// ─── inventory (stock, adjustments, value, price list, counts, transfers) ───────────────────────────
export const inventoryService = {
  storeStock: (params = {}) => api.get('/inventory/store-stock', { params }),
  batchDetails: (product_id) => api.get('/inventory/batch-details', { params: { product_id } }),
  expiryRisk: (threshold_days = 30) => api.get('/inventory/check-expiry', { params: { threshold_days, storeId: currentStoreId() } }),
  lowStock: () => api.get('/inventory/low-stock', { params: { storeId: currentStoreId() } }),
  movements: (params = {}) => api.get('/inventory/movements', { params: { storeId: currentStoreId(), ...params } }),
  stockValue: (priceCategoryId, params = {}) => api.get('/inventory/stock-value', { params: { priceCategoryId, ...params } }),
  saveValueSnapshot: (payload) => api.post('/inventory/stock-value-history', payload),
  valueHistory: (params = {}) => api.get('/inventory/stock-value-history', { params }),
  valueHistoryDetail: (id) => api.get(`/inventory/stock-value-history/${id}`),
  deleteValueHistory: (id) => api.delete(`/inventory/stock-value-history/${id}`),
  updateBatch: (payload) => api.put('/inventory/batch', payload),
  createAdjustment: (payload) => api.post('/inventory/adjustment', payload),
  adjustments: (params = {}) => api.get('/inventory/adjustments', { params }),
  adjustmentDetail: (id) => api.get(`/inventory/adjustment/${id}`),
  batchwiseStock: (params = {}) => api.get('/inventory/batchwise-stock', { params }),
  batchwiseAdjustment: (payload) => api.post('/inventory/adjustment-batchwise', payload),
  // price list (prices per price category and batch)
  priceList: (params = {}) => api.get('/pricelist', { params }),
  updatePrices: (payload) => api.put('/pricelist/update-prices', payload),
};
export const stockCountService = {
  products: (params = {}) => api.get('/stock-count/products', { params }),
  save: (payload) => api.post('/stock-count/save', payload),
  history: (params = {}) => api.get('/stock-count/history', { params }),
  detail: (id) => api.get(`/stock-count/history/${id}`),
  movements: (params = {}) => api.get('/stock-count/movements', { params }),
  adjustmentsByProduct: (params = {}) => api.get('/stock-count/adjustments-by-product', { params }),
  productAdjustments: (id, params = {}) => api.get(`/stock-count/adjustments/${id}`, { params }),
};
export const stockTransferService = {
  create: (payload) => api.post('/stock-transfer', payload),
  history: (params = {}) => api.get('/stock-transfer/history', { params }),
  detail: (id) => api.get(`/stock-transfer/${id}`),
  approve: (id) => api.post(`/stock-transfer/${id}/approve`),
  receive: (id, items) => api.post(`/stock-transfer/${id}/receive`, { items }),
  cancel: (id) => api.post(`/stock-transfer/${id}/cancel`),
  remove: (id) => api.delete(`/stock-transfer/${id}`),
};

// ─── expenses ───────────────────────────────────────────────────────────────────────────────────────
export const expenseService = {
  list: async (params = {}) => { const r = await api.get('/expenses', { params }); return { success: true, data: r.data ?? [], summary: r.summary, pagination: pageOf(r.pagination), raw: r }; },
  categories: async () => { const r = await api.get('/expenses/categories'); return { success: true, data: r.data ?? [] }; },
  create: async (data) => { const r = await api.post('/expenses', data); return { success: true, data: r.data, message: r.message }; },
  update: async (id, data) => { const r = await api.put(`/expenses/${id}`, data); return { success: true, data: r.data, message: r.message }; },
  remove: async (id) => asDone(await api.delete(`/expenses/${id}`)),
};

// ─── import / export (Excel) ────────────────────────────────────────────────────────────────────────
export const importExportService = {
  /** type: products | stock | prices | full | contacts → a Blob (.xlsx) */
  template: (type, responseType = 'blob') => api.get(`/import-export/template/${type}`, { responseType }),
  exportData: (type, responseType = 'blob') => api.get(`/import-export/export/${type}`, { responseType }),
  /** Uploads an .xlsx/.csv file; resolves with the server's result (counts and per-row errors). */
  /** When some rows have errors the server answers { requiresConfirmation: true, results } and imports NOTHING until the same file is sent again with { confirmed: true } (valid rows only). */
  importFile: (type, file, { confirmed = false } = {}) => { const fd = new FormData(); fd.append('file', file); return api.post(`/import-export/${type}`, fd, { params: confirmed ? { confirmed: 'true' } : undefined, headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }); },
};

// ─── reports ───────────────────────────────────────────────────────────────────────────────────────
// One call for all 47 report endpoints: reportService.get('/sales/by-product', { startDate, endDate, saleType }).
export const reportService = {
  get: (path, params = {}) => api.get(`/reports${path}`, { params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null)) }),
};

// ─── administration: roles, people, permissions ─────────────────────────────────────────────────────
export const roleService = {
  getAll: async () => { const r = await api.get('/roles'); return { success: true, data: r.roles || [], raw: r }; },
  create: async (data) => asOne(await api.post('/roles', data), 'role'),
  update: async (id, data) => asOne(await api.put(`/roles/${id}`, data), 'role'),
  remove: async (id) => asDone(await api.delete(`/roles/${id}`)),
};
export const userAdminService = {
  list: async (params = {}) => asList(await api.get(`/store-users/${params.storeId || currentStoreId()}/users`, { params: { page: params.page, limit: params.limit, search: params.search } }), 'users'),
  /** role = the role's id */
  create: async (data) => asOne(await api.post('/store-users/create-user', data), 'user'),
  /** id = the person's USER id; { role, status } */
  update: async (userId, data) => asOne(await api.put(`/store-users/${userId}`, data), 'user'),
  remove: async (userId) => asDone(await api.delete(`/store-users/${userId}`)),
};
export const permissionService = {
  /** → { modules: { Module: { Submodule: [{ id, name, description, is_allowed }] } } } */
  get: async (roleId) => { const r = await api.get('/permissions', { params: { roleId } }); return { success: true, data: r.permissions || {} }; },
  set: async ({ roleId, permissionId, isAllowed }) => asDone(await api.post('/permissions', { roleId, permissionId, isAllowed })),
  /** switch a whole module (or one submodule of it) on or off */
  setMany: async ({ roleId, module, submodule, isAllowed }) => asDone(await api.post('/permissions/bulk', { roleId, module, submodule, isAllowed })),
};

// ─── store settings (configuration, security, notifications, branding) ──────────────────────────────
export const settingsAdminService = {
  /** → { systemSettings: { businessInfo, systemDefaults, systemOptions }, storeSettings: { operations, systemOptions, … } } */
  getAll: () => api.get('/settings'),
  /** Saves { operations, systemDefaults, businessInfo } — business info and system defaults are only kept when operations.isPrimaryStore is true. */
  update: (storeId, payload) => api.put(`/settings/${storeId}`, payload),
  getNotifications: async () => (await api.get('/settings/notifications')).notifications || {},
  updateNotifications: (notifications) => api.put('/settings/notifications', { notifications }),
  testRunNotifications: (force = false) => api.post('/settings/notifications/test-run', { force }),
  getBranding: async () => (await api.get('/settings/branding')).branding || {},
  uploadBranding: (assetType, file) => { const fd = new FormData(); fd.append('asset_type', assetType); fd.append('file', file); return api.post('/settings/branding/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); },
  removeBranding: (assetType) => api.delete(`/settings/branding/${assetType}`),
};

// ─── system tools and backups ───────────────────────────────────────────────────────────────────────
export const toolsService = {
  /** SQL text of THIS store's data (a download) */
  exportStoreData: (responseType = 'blob') => api.get('/tools/export', { responseType }),
  backupStoreDatabase: (responseType = 'blob') => api.get('/tools/backup', { responseType }),
  dbHealth: () => api.get('/tools/db-health'),
  clearCache: () => api.post('/tools/clear-cache', {}),
  /** → { logs: [{ id, action, description, ip_address, created_at, user_name, user_email }], total, page, … } */
  logs: (params = {}) => api.get('/tools/logs', { params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null)) }),
};
export const backupService = {
  status: () => api.get('/backups/status'),
  list: (limit = 10) => api.get('/backups', { params: { limit } }),
  testConnection: () => api.post('/backups/test', {}),
  runNow: () => api.post('/backups/run', {}),
  /** replaces the WHOLE database: the developer account only */
  restoreFromDrive: (driveFileId) => api.post(`/backups/restore/drive/${driveFileId}`, {}),
  restoreFromUpload: (file) => { const fd = new FormData(); fd.append('backup_file', file); return api.post('/backups/restore/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 }); },
};
export const integrationService = {
  /** developer account only (403 for everybody else) */
  access: () => api.get('/integrations/access'),
  list: async () => (await api.get('/integrations')).integrations || [],
  save: (provider, config) => api.put(`/integrations/${provider}`, { config }),
  verify: (provider, config) => api.post(`/integrations/${provider}/verify`, config ? { config } : {}),
};

// ─── messaging (SMS: contacts, groups, templates, sending, account) ─────────────────────────────────
export const messagingService = {
  history: async () => (await api.get('/messaging/history')).messages || [],
  /** → { batch_id, message, created_at, group_name, sent_by, recipients: [{ recipient, recipient_name, status, error }] } */
  batch: (batchId) => api.get(`/messaging/history/${batchId}`),
  /** contacts = list of phone numbers (international format) */
  send: ({ contacts, message }) => api.post('/messaging/send', { contacts, message }),
  sendToGroup: (groupId, { message, includeSubgroups }) => api.post(`/messaging/groups/${groupId}/send`, { message, includeSubgroups: !!includeSubgroups }),
  groups: async () => (await api.get('/messaging/groups')).groups || [],
  createGroup: ({ name, parentGroupId }) => api.post('/messaging/groups', { name, parentGroupId: parentGroupId || undefined }),
  updateGroup: (id, { name }) => api.put(`/messaging/groups/${id}`, { name }),
  deleteGroup: (id) => api.delete(`/messaging/groups/${id}`),
  contacts: async () => (await api.get('/messaging/contacts')).contacts || [],
  groupContacts: async (groupId) => (await api.get(`/messaging/groups/${groupId}/contacts`)).contacts || [],
  createContact: ({ name, phone, groupId }) => api.post('/messaging/contacts', { name, phone, groupId: groupId || undefined }),
  updateContact: (id, { name, phone }) => api.put(`/messaging/contacts/${id}`, { name, phone }),
  setContactGroups: (id, groupIds) => api.put(`/messaging/contacts/${id}/groups`, { groupIds }),
  deleteContact: (id) => api.delete(`/messaging/contacts/${id}`),
  assignContacts: (groupId, contactIds) => api.post(`/messaging/groups/${groupId}/assign`, { contactIds }),
  removeFromGroup: (groupId, contactId) => api.delete(`/messaging/groups/${groupId}/contacts/${contactId}`),
  templates: async () => (await api.get('/messaging/templates')).templates || [],
  createTemplate: ({ name, content }) => api.post('/messaging/templates', { name, content }),
  updateTemplate: (id, { name, content }) => api.put(`/messaging/templates/${id}`, { name, content }),
  deleteTemplate: (id) => api.delete(`/messaging/templates/${id}`),
  // account (400 { code: 'no_default_sms_gateway' } until the developer account sets a gateway)
  gatewayInfo: () => api.get('/messaging/gateway-info'),
  accountStats: () => api.get('/messaging/account-stats'),
  topupRequest: () => api.post('/messaging/topup/request', {}),
  topupUssd: ({ amountTzs, phone }) => api.post('/messaging/topup/ussd', { amountTzs, phone }),
  zenoCreate: ({ amount, buyerName, buyerPhone }) => api.post('/messaging/topup/zenopay', { amount, buyerName, buyerPhone }),
  zenoStatus: (orderId) => api.get('/messaging/topup/zenopay/status', { params: { orderId } }),
  senderIds: async () => (await api.get('/messaging/sender-ids')).senderIds || [],
  requestSenderId: ({ name, description, sampleMessage }) => api.post('/messaging/sender-ids', { name, description, sampleMessage }),
};

// ─── subscription (plans, payment, history) ─────────────────────────────────────────────────────────
export const subscriptionService = {
  plans: async () => (await api.get('/subscriptions/plans')).plans || [],
  /** → { id, status, current_cycle, starts_at, ends_at, grace_ends_at, plan_code, plan_name, monthly_amount, annual_amount, … } or null */
  me: async () => (await api.get('/subscriptions/me')).subscription || null,
  history: async () => (await api.get('/subscriptions/history')).transactions || [],
  /** → { transactionId, requestId, amount, currency, billingCycle, plan, providerResponse } (the person confirms on their phone) */
  checkout: async (data) => (await api.post('/subscriptions/checkout', data)).checkout,
  /** asks ClickPesa for the real status of the payment and applies it → { status, … } */
  verify: async (transactionId) => (await api.post(`/subscriptions/verify/${transactionId}`, {})).result,
};

// ─── support tickets ────────────────────────────────────────────────────────────────────────────────
export const supportService = {
  createTicket: (data) => api.post('/support/tickets', data),
  myTickets: async () => (await api.get('/support/tickets/my')).tickets || [],
  /** support staff only (SUPPORT_ADMIN_EMAILS / DEVELOPER_EMAIL) */
  adminAccess: () => api.get('/support/admin/access'),
  adminStats: async () => (await api.get('/support/admin/stats')).stats,
  adminList: (params = {}) => api.get('/support/admin/tickets', { params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null)) }),
  adminGet: async (id) => { const r = await api.get(`/support/admin/tickets/${id}`); return { ...r.ticket, replies: r.replies || [] }; },
  adminSetStatus: (id, status) => api.patch(`/support/admin/tickets/${id}/status`, { status }),
  adminReply: (id, message, isInternal = false) => api.post(`/support/admin/tickets/${id}/reply`, { message, is_internal: isInternal }),
};

// ─── BizTrack AI (chat, business summary, report explanations) ──────────────────────────────────────
// Without a provider key the server still answers from VERIFIED data (source: "fallback"); with one (AI_PROVIDER + its key) the same
// data is explained by the model. Every call is limited by the person's ai_* permissions on the server.
export const aiService = {
  /** → { conversationId, answer, source, provider, toolsUsed, toolsDenied, toolSelectionStrategy, confidence, … } */
  ask: async ({ message, conversationId }) => (await api.post('/ai/chat', { message, conversationId: conversationId || undefined })).data,
  conversations: async () => (await api.get('/ai/conversations')).data || [],
  conversation: async (id) => (await api.get(`/ai/conversations/${id}`)).data,
  deleteConversation: (id) => api.delete(`/ai/conversations/${id}`),
  capabilities: async () => (await api.get('/ai/capabilities')).data,
  providerStatus: async () => (await api.get('/ai/provider-status')).data,
  businessSummary: async (refresh = false) => (await api.get('/ai/business-summary', { params: refresh ? { refresh: 'true' } : undefined })).data,
  /** reportType: sales | profit | inventory */
  explainReport: async ({ reportType, reportKey, filters }) => (await api.post('/ai/explain', { reportType, reportKey, filters })).data,
};

// ─── dashboard ────────────────────────────────────────────────────────────────────────────────────
export const dashboardService = {
  getStats: async () => { const res = await api.get('/dashboard/stats'); return { success: true, data: res.data ?? res, raw: res }; },
};

// ─── display preferences ──────────────────────────────────────────────────────────────────────────
// Date format / money decimals / receipt size are kept in this browser for now; the server-side copy
// arrives with the Settings module (phase 5). PreferencesContext tolerates a failed fetch.
export const settingsService = {
  getOverview: async () => { throw new Error('not available yet'); },
  updateDisplay: async (patch) => ({ success: true, data: patch }),
};

export { lang };
