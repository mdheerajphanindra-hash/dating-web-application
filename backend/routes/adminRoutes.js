const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const {
  adminBlockUser,
  adminDeleteUser,
  adminUnblockUser,
  getAdminStats,
  getUsers
} = require('../controllers/userController');

const router = express.Router();

router.get('/stats', authMiddleware, adminMiddleware, getAdminStats);
router.get('/users', authMiddleware, adminMiddleware, getUsers);
router.patch('/users/:userId/block', authMiddleware, adminMiddleware, adminBlockUser);
router.patch('/users/:userId/unblock', authMiddleware, adminMiddleware, adminUnblockUser);
router.delete('/users/:userId', authMiddleware, adminMiddleware, adminDeleteUser);

module.exports = router;
