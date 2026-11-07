// routes/storeRoutes.js
import * as _n43 from 'express';
const express = _n43.default ?? _n43;
import * as storeController from '../controllers/store.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

router.post('/', authMiddleware, storeController.createStore);
router.get('/',   authMiddleware, storeController.getMyStores);
router.get('/default', authMiddleware, storeController.getDefaultStore);
router.put('/:id',authMiddleware, storeController.updateStore);
router.delete('/:id', authMiddleware, storeController.deleteStore);
router.post('/:id/delete', authMiddleware, storeController.deleteStore);

export default router;