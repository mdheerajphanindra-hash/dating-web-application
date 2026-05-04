const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const { deleteMessage, getMessages, markMessagesSeen, sendMessage } = require('../controllers/messageController');

const router = express.Router();

router.get('/:matchId', authMiddleware, getMessages);
router.post('/:matchId', authMiddleware, sendMessage);
router.patch('/:matchId/seen', authMiddleware, markMessagesSeen);
router.delete('/:matchId/:messageId', authMiddleware, deleteMessage);

module.exports = router;
