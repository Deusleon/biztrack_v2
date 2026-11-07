// path: backend/routes/importExport.routes.js
import * as _n57 from 'express';
const express = _n57.default ?? _n57;
import * as _n58 from 'multer';
const multer = _n58.default ?? _n58;
import authMiddleware from '../middlewares/authMiddleware.js';
import { checkPermission } from '../middlewares/checkPermission.js';
import * as importExportController from '../controllers/importExport.controller.js';
const router = express.Router();

// Memory storage – file is read into buffer, never saved to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel",                                            // .xls
      "text/csv",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel (.xlsx, .xls) and CSV files are allowed"), false);
    }
  },
});

// Templates
router.get("/template/:type", authMiddleware, importExportController.downloadTemplate);

// Import routes (require file upload)
router.post(
  "/products",
  authMiddleware,
  checkPermission(["import_products", "manage_products", "edit_products"], false),
  upload.single("file"),
  importExportController.importProducts
);

router.post(
  "/stock",
  authMiddleware,
  checkPermission(["import_stock", "manage_inventory", "manage_stock"], false),
  upload.single("file"),
  importExportController.importStock
);

router.post(
  "/prices",
  authMiddleware,
  checkPermission(["import_prices", "manage_products", "manage_prices"], false),
  upload.single("file"),
  importExportController.importPrices
);

router.post(
  "/full",
  authMiddleware,
  checkPermission(["view_products", "manage_inventory"], false),
  upload.single("file"),
  importExportController.importFull
);

router.post(
  "/contacts",
  authMiddleware,
  checkPermission(["manage_integration", "view_integration"], false),
  upload.single("file"),
  importExportController.importContacts
);

// Export routes
router.get(
  "/export/:type",
  authMiddleware,
  checkPermission(["view_imports_exports", "export_products", "export_stock", "export_prices"], false),
  importExportController.exportData
);

export default router;