const express = require('express');

const { getPersonalityQuiz } = require('../controllers/authController');

const router = express.Router();

router.get('/personality-quiz', getPersonalityQuiz);

module.exports = router;
