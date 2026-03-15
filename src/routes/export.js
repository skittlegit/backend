const { Router } = require('express');
const { exportData } = require('../controllers/exportController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();

router.get('/data', authenticate, requireRole('manager'), exportData);

module.exports = router;
