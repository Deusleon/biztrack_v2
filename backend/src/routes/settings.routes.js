// routes/settings.routes.js
import * as _n45 from 'express';
const express = _n45.default ?? _n45;
import * as _n46 from 'multer';
const multer = _n46.default ?? _n46;
import * as settingsController from '../controllers/setting.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

router.get('/',                    authMiddleware, settingsController.getStoreSettings);
router.get('/notifications',       authMiddleware, checkStorePermission(['view_notifications', 'manage_notifications']), settingsController.getNotificationSettings);
router.put('/notifications',       authMiddleware, checkStorePermission(['manage_notifications']), settingsController.updateNotificationSettings);
router.post('/notifications/test-run', authMiddleware, checkStorePermission(['manage_notifications']), settingsController.testRunNotifications);
router.get('/branding',            authMiddleware, settingsController.getBrandingAssets);
router.post('/branding/upload',    authMiddleware, checkStorePermission(['manage_uploads']), upload.single('file'), settingsController.uploadBrandingAsset);
router.delete('/branding/:asset_type', authMiddleware, checkStorePermission(['manage_uploads']), settingsController.removeBrandingAsset);
// one endpoint saves every settings tab, so any of the settings permissions opens it
router.put('/:id',                 authMiddleware, checkStorePermission(['edit_configurations', 'view_security', 'view_appearance', 'manage_notifications', 'manage_uploads', 'view_bulk_operations', 'view_tools', 'manage_integration']), settingsController.updateStoreSettings);

export default router;