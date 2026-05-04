const bcrypt = require('bcryptjs');

const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const {
  applyProfileQuality,
  buildIdentityQuery,
  createOtp,
  sanitizeUser,
  sendResetPasswordEmail,
  updateStreak,
  normalizeInterestList,
  normalizePhotoList
} = require('../utils/appHelpers');

async function getPersonalityQuiz(req, res) {
  return res.json({
    questions: [
      { key: 'socialStyle', question: 'Introvert or extrovert?', options: ['Introvert', 'Ambivert', 'Extrovert'] },
      { key: 'scheduleStyle', question: 'Night owl or early bird?', options: ['Night owl', 'Balanced', 'Early bird'] },
      { key: 'datingIntent', question: 'What are you looking for?', options: ['Serious', 'Casual', 'Open to both'] },
      { key: 'communicationStyle', question: 'How do you text?', options: ['Fast replies', 'Thoughtful replies', 'Voice note energy'] },
      { key: 'weekendStyle', question: 'Ideal weekend?', options: ['Outdoors', 'Movies and food', 'Parties and social plans'] }
    ]
  });
}

async function registerUser(req, res) {
  try {
    const {
      name,
      email,
      phone,
      password,
      age,
      gender,
      interestedIn,
      location,
      bio = '',
      interests = [],
      photos = [],
      education = '',
      job = '',
      personalityAnswers = {},
      latitude = null,
      longitude = null
    } = req.body;

    if (!password || (!email && !phone)) {
      return res.status(400).json({ message: 'Email or phone and password are required.' });
    }

    const identityQuery = buildIdentityQuery(email, phone);
    const existingUser = identityQuery ? await User.findOne(identityQuery) : null;
    if (existingUser) {
      return res.status(409).json({ message: 'Email or phone already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otpCode = createOtp();
    const user = new User({
      name: name || '',
      email: email ? String(email).toLowerCase() : undefined,
      phone: phone || undefined,
      password: hashedPassword,
      age: age || 18,
      gender: gender || 'Other',
      interestedIn: interestedIn || 'Everyone',
      location: location || '',
      bio,
      interests: normalizeInterestList(interests),
      photos: normalizePhotoList(photos, 6),
      education,
      job,
      personalityAnswers,
      latitude,
      longitude,
      otpCode,
      otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    applyProfileQuality(user);
    await user.save();

    return res.status(201).json({
      message: 'Signup successful. Verify OTP to activate your account.',
      user: sanitizeUser(user),
      otpCode
    });
  } catch (error) {
    return res.status(500).json({ message: 'Signup failed.', error: error.message });
  }
}

async function verifyOtp(req, res) {
  try {
    const { email, phone, otpCode } = req.body;
    const identityQuery = buildIdentityQuery(email, phone);
    if (!identityQuery) {
      return res.status(400).json({ message: 'Email or phone is required.' });
    }

    const user = await User.findOne(identityQuery);
    if (!user || !otpCode) {
      return res.status(400).json({ message: 'Invalid verification request.' });
    }

    if (user.otpCode !== otpCode || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP is invalid or expired.' });
    }

    user.isVerified = true;
    user.verificationStatus = user.verificationStatus === 'pending' ? 'pending' : 'verified';
    user.otpCode = null;
    user.otpExpiresAt = null;
    updateStreak(user);
    await user.save();

    const token = generateToken(user);
    return res.json({ message: 'OTP verified successfully.', token, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'OTP verification failed.', error: error.message });
  }
}

async function loginUser(req, res) {
  try {
    const { email, phone, password } = req.body;
    const identityQuery = buildIdentityQuery(email, phone);
    if (!identityQuery) {
      return res.status(400).json({ message: 'Email or phone is required.' });
    }

    const user = await User.findOne(identityQuery);
    if (!user) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const isMatch = await bcrypt.compare(password || '', user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password.' });
    }

    if (!user.isVerified) {
      const otpCode = createOtp();
      user.otpCode = otpCode;
      user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      return res.status(403).json({ message: 'Account not verified. Verify OTP first.', otpCode });
    }

    updateStreak(user);
    await user.save();

    const token = generateToken(user);
    return res.json({ message: 'Login successful.', token, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed.', error: error.message });
  }
}

async function forgotPassword(req, res) {
  try {
    const { email, phone } = req.body;
    const identityQuery = buildIdentityQuery(email, phone);
    if (!identityQuery) {
      return res.status(400).json({ message: 'Email or phone is required.' });
    }

    const user = await User.findOne(identityQuery);
    if (!user) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const resetOtpCode = createOtp();
    user.resetOtpCode = resetOtpCode;
    user.resetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const emailResult = await sendResetPasswordEmail(user.email, resetOtpCode);

    return res.json({
      message: emailResult.delivered
        ? 'Password reset code sent to your email.'
        : 'Password reset OTP generated. Email sending is not configured, so the demo code is returned below.',
      resetOtpCode: emailResult.delivered ? undefined : resetOtpCode,
      emailSent: emailResult.delivered
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not generate reset OTP.', error: error.message });
  }
}

async function resetPassword(req, res) {
  try {
    const { email, phone, otpCode, newPassword } = req.body;
    const identityQuery = buildIdentityQuery(email, phone);
    if (!identityQuery) {
      return res.status(400).json({ message: 'Email or phone is required.' });
    }

    const user = await User.findOne(identityQuery);
    if (!user || !otpCode || !newPassword) {
      return res.status(400).json({ message: 'Invalid reset request.' });
    }

    if (user.resetOtpCode !== otpCode || !user.resetOtpExpiresAt || user.resetOtpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'Reset OTP is invalid or expired.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetOtpCode = null;
    user.resetOtpExpiresAt = null;
    await user.save();

    return res.json({ message: 'Password reset successful.' });
  } catch (error) {
    return res.status(500).json({ message: 'Password reset failed.', error: error.message });
  }
}

async function getCurrentUser(req, res) {
  updateStreak(req.user);
  await req.user.save();
  return res.json({ user: sanitizeUser(req.user) });
}

module.exports = {
  forgotPassword,
  getCurrentUser,
  getPersonalityQuiz,
  loginUser,
  registerUser,
  resetPassword,
  verifyOtp
};
