import * as _n64 from 'express';
const express = _n64.default ?? _n64;
import authMiddleware from '../middlewares/authMiddleware.js';
import * as profileController from '../controllers/profile.controller.js';
const router = express.Router();

router.get("/",           authMiddleware, profileController.getProfile);
router.put("/",           authMiddleware, profileController.updateProfile);
router.put("/password",   authMiddleware, profileController.changePassword);
router.post("/avatar",    authMiddleware, profileController.uploadAvatar);
router.delete("/avatar",  authMiddleware, profileController.removeAvatar);

export default router;