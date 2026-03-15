const { Router } = require('express');
const { listStores, createStore, getStore, updateStore, markComplete, deleteStore } = require('../controllers/storeController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

router.get('/', listStores);
router.post('/', requireRole('manager'), createStore);
router.get('/:id', getStore);
router.put('/:id', requireRole('manager'), updateStore);
router.put('/:id/complete', markComplete);
router.delete('/:id', requireRole('manager'), deleteStore);

module.exports = router;
