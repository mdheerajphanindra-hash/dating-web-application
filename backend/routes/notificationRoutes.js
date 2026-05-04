const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const { getNotificationSummary } = require('../controllers/userController');

const router = express.Router();

router.get('/summary', authMiddleware, getNotificationSummary);

module.exports = router;
