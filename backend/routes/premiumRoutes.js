const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const { upgradePremium } = require('../controllers/userController');

const router = express.Router();

router.post('/upgrade', authMiddleware, upgradePremium);

module.exports = router;
