import * as _n1 from 'express';
const express = _n1.default ?? _n1;
import * as _n2 from 'cors';
const cors = _n2.default ?? _n2;
import * as _n3 from 'compression';
const compression = _n3.default ?? _n3;
import 'dotenv/config';
import { pendingMigrations } from './utils/migrate.js';
import { testConnection } from './config/database.js';
import http from 'http';
import { initSocket } from './utils/socket.js';
import { startNotificationScheduler } from './services/notificationScheduler.js';
import { startBackupScheduler } from './services/backupScheduler.js';
import { startStockValueHistoryScheduler } from './services/stockValueHistoryScheduler.js';
import { perfMiddleware } from './utils/perf.js';
import cacheInvalidation from './middlewares/cacheInvalidation.js';
const app = express();
const server = http.createServer(app);
initSocket(server);
startNotificationScheduler();
startBackupScheduler();
startStockValueHistoryScheduler();

// CLIENT_URL may list several origins separated by commas (web app, installed PWA, preview builds).
const allowedOrigins = (process.env.CLIENT_URL || '').split(',').map((o) => o.trim()).filter(Boolean);

// Middlewares

// Request timing (logs slow requests; everything with PERF_LOG=1). Must be first.
app.use(perfMiddleware);
// Clears role/permission caches after changes to roles, permissions, store users.
app.use(cacheInvalidation);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // Let the browser cache the CORS preflight (OPTIONS) result. Without this,
  // Chrome re-sends a preflight before almost every API call (5 s default),
  // doubling the round trips on every request in production.
  maxAge: 86400,
}));

app.use(compression()); // gzip all JSON responses
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
import authRoutes from './routes/auth/authRoutes.js';
import verifyEmailRoutes from './routes/auth/verifyEmailRoutes.js';
import forgotPasswordRoutes from './routes/auth/forgotPasswordRoutes.js';
import resetPasswordRoutes from './routes/auth/resetPasswordRoutes.js';
import storeRoutes from './routes/store.routes.js';
import storeUserRoutes from './routes/storeUser.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import integrationRoutes from './routes/integrations.routes.js';
import messagingRoutes from './routes/messaging.routes.js';
import roleRoutes from './routes/role.routes.js';
import permissionsRoutes from './routes/permission.routes.js';
import categoryRoutes from './routes/category.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import productRoutes from './routes/product.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import stockCountRoutes from './routes/stockCount.routes.js';
import stockTransferRoutes from './routes/stockTransfer.routes.js';
import salesRoutes from './routes/sales.routes.js';
import customerRoutes from './routes/customer.routes.js';
import supplierRoutes from './routes/supplier.routes.js';
import imageRoutes from './routes/images.routes.js';
import userRoutes from './routes/user.routes.js';
import priceCategoryRoutes from './routes/priceCategory.routes.js';
import priceListRoutes from './routes/priceList.routes.js';
import purchaseRoutes from './routes/purchase.routes.js';
import reportRoutes from './routes/report.routes.js';
import qzSignRoutes from './routes/qzSign.routes.js';
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf?.toString('utf8') || '';
  },
}));
import toolsRoutes from './routes/tools.routes.js';
import backupRoutes from './routes/backup.routes.js';
import supportRoutes from './routes/support.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import aiRoutes from './routes/ai.routes.js';
import profileRoutes from './routes/profile.routes.js';
import importExportRoutes from './routes/importExport.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import testRoutes from './routes/testRoutes.js';
app.get("/health", (req, res) => res.json({ success: true, message: "Server is running", timestamp: new Date().toISOString() }));

app.get("/", (req, res) => {
  res.json({
    status: "success",
    message: "BizTrack API is running",
  });
});
// Test route
app.use('/api/test', testRoutes);
// Images route
app.use('/api/images', imageRoutes);
// User routes
app.use('/api/user', userRoutes);
// Authentication routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/verify-email', verifyEmailRoutes);
// Password management routes
app.use('/api/auth/forgot-password', forgotPasswordRoutes);
app.use('/api/auth/reset-password', resetPasswordRoutes);
// Subscription routes
app.use('/api/subscriptions', subscriptionRoutes);
// Store routes 
app.use('/api/stores', storeRoutes);
app.use('/api/store-users', storeUserRoutes);
// Settings routes
app.use('/api/settings', settingsRoutes);
// Integrations routes
app.use('/api/integrations', integrationRoutes);
app.use('/api/messaging', messagingRoutes);
// Cloud backup routes
app.use('/api/backups', backupRoutes);
// Support tickets (create endpoints include a public one for guests)
app.use('/api/support', supportRoutes);
// Roles routes
app.use('/api/roles', roleRoutes);
// Permissions routes
app.use('/api/permissions', permissionsRoutes);
// Category routes
app.use('/api/categories', categoryRoutes);
// Product routes
app.use('/api/products', productRoutes);
// Inventory routes
app.use('/api/inventory', inventoryRoutes);
// Stock Count routes
app.use('/api/stock-count', stockCountRoutes);
// Stock Transfer routes
app.use('/api/stock-transfer', stockTransferRoutes);
// Sales routes
app.use('/api/sales', salesRoutes);
// Customer routes
app.use('/api/customers', customerRoutes);
// Supplier routes
app.use('/api/suppliers', supplierRoutes);
// Price category routes
app.use('/api/price-categories', priceCategoryRoutes);
// Price list routes
app.use('/api/pricelist', priceListRoutes);
// Purchase routes
app.use('/api/purchases', purchaseRoutes);
// Reports routes
app.use('/api/reports', reportRoutes);
// QZ Tray signing route
app.use('/api/qz', qzSignRoutes);
// Tools & activity logs routes
app.use('/api/tools', toolsRoutes);
// Dashboard routes
app.use('/api/dashboard', dashboardRoutes);
// AI business insights routes
app.use('/api/ai', aiRoutes);
// Profile routes (current user)
app.use('/api/profile', profileRoutes);
// Import / Export routes
app.use('/api/import-export', importExportRoutes);
// Expense routes
app.use('/api/expenses', expenseRoutes);

// Server
const PORT = process.env.PORT || 5000;

const start = async () => {
  if (!(await testConnection())) process.exit(1);
  // The database structure is changed ONLY by `npm run db:migrate` (which backs up first).
  const pending = await pendingMigrations().catch(() => null);
  if (pending && pending.length) {
    console.warn(`⚠️  ${pending.length} database migration(s) pending — run: npm run db:migrate`);
    if (process.env.REQUIRE_MIGRATIONS === '1') { console.error('Refusing to start with pending migrations.'); process.exit(1); }
  }
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};
start();

export default app;
