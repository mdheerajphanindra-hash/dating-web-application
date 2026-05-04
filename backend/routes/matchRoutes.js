const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const { connectMatch, getMatches, updateMatchStar } = require('../controllers/matchController');
const { deleteMessage, getMessages, markMessagesSeen, sendMessage } = require('../controllers/messageController');

const router = express.Router();

router.get('/', authMiddleware, getMatches);
router.post('/connect', authMiddleware, connectMatch);
router.patch('/:matchId/star', authMiddleware, updateMatchStar);
router.get('/:matchId/messages', authMiddleware, getMessages);
router.post('/:matchId/messages', authMiddleware, sendMessage);
router.patch('/:matchId/messages/seen', authMiddleware, markMessagesSeen);
router.delete('/:matchId/messages/:messageId', authMiddleware, deleteMessage);

module.exports = router;
