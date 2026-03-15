const { Router } = require('express');
const { uploadPhoto } = require('../controllers/uploadController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = Router();

router.post('/photo', authenticate, upload.single('photo'), uploadPhoto);

module.exports = router;
