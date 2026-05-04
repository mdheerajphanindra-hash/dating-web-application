const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const {
  forgotPassword,
  getCurrentUser,
  getPersonalityQuiz,
  loginUser,
  registerUser,
  resetPassword,
  verifyOtp
} = require('../controllers/authController');

const router = express.Router();

router.get('/personality-quiz', getPersonalityQuiz);
router.post('/signup', registerUser);
router.post('/verify-otp', verifyOtp);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', authMiddleware, getCurrentUser);

module.exports = router;
