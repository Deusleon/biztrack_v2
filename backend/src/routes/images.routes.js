// routes/images.js (Express)
import * as _n52 from 'express';
const express = _n52.default ?? _n52;
const router  = express.Router();
import cloudinary from '../utils/cloudinaryConfig.js';
import verifyToken from '../middlewares/authMiddleware.js';
router.delete("/:publicId", verifyToken, async (req, res) => {
  try {
    const { publicId } = req.params;
    await cloudinary.uploader.destroy(publicId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

export default router;