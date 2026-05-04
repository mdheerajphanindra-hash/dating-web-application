const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const {
  blockUser,
  boostProfile,
  discoverUsers,
  rewindSwipe,
  submitVerification,
  unblockUser,
  updateUser
} = require('../controllers/userController');
const { reportUser } = require('../controllers/reportController');

const router = express.Router();

router.put('/profile', authMiddleware, updateUser);
router.post('/verification', authMiddleware, submitVerification);
router.post('/boost', authMiddleware, boostProfile);
router.post('/rewind', authMiddleware, rewindSwipe);
router.get('/discover', authMiddleware, discoverUsers);
router.post('/block/:userId', authMiddleware, blockUser);
router.post('/unblock/:userId', authMiddleware, unblockUser);
router.post('/report/:userId', authMiddleware, reportUser);

module.exports = router;
