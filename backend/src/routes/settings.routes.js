// routes/settings.routes.js
import * as _n45 from 'express';
const express = _n45.default ?? _n45;
import * as _n46 from 'multer';
const multer = _n46.default ?? _n46;
import * as settingsController from '../controllers/setting.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
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
router.get('/notifications',       authMiddleware, settingsController.getNotificationSettings);
router.put('/notifications',       authMiddleware, settingsController.updateNotificationSettings);
router.post('/notifications/test-run', authMiddleware, settingsController.testRunNotifications);
router.get('/branding',            authMiddleware, settingsController.getBrandingAssets);
router.post('/branding/upload',    authMiddleware, upload.single('file'), settingsController.uploadBrandingAsset);
router.delete('/branding/:asset_type', authMiddleware, settingsController.removeBrandingAsset);
router.put('/:id',                 authMiddleware, settingsController.updateStoreSettings);

export default router;