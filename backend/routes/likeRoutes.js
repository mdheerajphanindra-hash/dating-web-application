const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const {
  getReceivedLikes,
  getSentLikes,
  likeUser,
  removeAllSentLikes,
  removeSentLike,
  removeSentLikeById
} = require('../controllers/likeController');

const router = express.Router();

router.post('/', authMiddleware, likeUser);
router.get('/received', authMiddleware, getReceivedLikes);
router.get('/sent', authMiddleware, getSentLikes);
router.delete('/sent/:likeId', authMiddleware, removeSentLikeById);
router.delete('/sent', authMiddleware, removeAllSentLikes);
router.post('/sent/remove', authMiddleware, removeSentLike);
router.post('/sent/remove-all', authMiddleware, removeAllSentLikes);

module.exports = router;
