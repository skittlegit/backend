const { Router } = require('express');
const { createBoard, listBoards, getBoard, updateBoard, deleteBoard } = require('../controllers/boardController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = Router();

router.use(authenticate);

router.post('/', upload.single('photo'), createBoard);
router.get('/', listBoards);
router.get('/:id', getBoard);
router.put('/:id', updateBoard);
router.delete('/:id', deleteBoard);

module.exports = router;
