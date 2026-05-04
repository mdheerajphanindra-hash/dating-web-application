const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const { changePassword, deleteAccount, updatePrivacy } = require('../controllers/userController');

const router = express.Router();

router.put('/password', authMiddleware, changePassword);
router.put('/privacy', authMiddleware, updatePrivacy);
router.delete('/account', authMiddleware, deleteAccount);

module.exports = router;
