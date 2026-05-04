const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
  phone: { type: String, trim: true, sparse: true, unique: true },
  password: { type: String, required: true },
  age: { type: Number, default: 18 },
  birthDate: { type: Date, default: null },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Other' },
  interestedIn: { type: String, enum: ['Male', 'Female', 'Other', 'Everyone'], default: 'Everyone' },
  location: { type: String, default: '' },
  bio: { type: String, default: '' },
  interests: [{ type: String }],
  photos: [{ type: String }],
  education: { type: String, default: '' },
  job: { type: String, default: '' },
  role: { type: String, default: 'user' },
  isVerified: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['unverified', 'pending', 'verified'], default: 'unverified' },
  verificationDocs: [{ type: String }],
  verificationFaceMatchScore: { type: Number, default: 0 },
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  profileVisible: { type: Boolean, default: true },
  qualityVisible: { type: Boolean, default: false },
  onboardingCompleted: { type: Boolean, default: false },
  showGenderOnProfile: { type: Boolean, default: false },
  adminBlocked: { type: Boolean, default: false },
  allowMessages: { type: Boolean, default: true },
  distancePreferenceKm: { type: Number, default: 80 },
  personalityAnswers: {
    socialStyle: { type: String, default: '' },
    scheduleStyle: { type: String, default: '' },
    datingIntent: { type: String, default: '' },
    communicationStyle: { type: String, default: '' },
    weekendStyle: { type: String, default: '' }
  },
  lifestyleAnswers: {
    drinking: { type: String, default: '' },
    smoking: { type: String, default: '' },
    workout: { type: String, default: '' },
    pets: { type: String, default: '' }
  },
  profilePrompts: {
    communicationStyle: [{ type: String }],
    loveLanguage: [{ type: String }],
    educationLevel: { type: String, default: '' },
    standoutPromptQuestion: { type: String, default: '' },
    standoutPromptAnswer: { type: String, default: '' }
  },
  blockedContactIdentifiers: [{ type: String }],
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  travelModeEnabled: { type: Boolean, default: false },
  travelLocation: { type: String, default: '' },
  dailyLikeCount: { type: Number, default: 0 },
  dailyLikeDate: { type: Date, default: null },
  lastSwipe: {
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, default: '' },
    createdAt: { type: Date, default: null }
  },
  boostedUntil: { type: Date, default: null },
  streakCount: { type: Number, default: 0 },
  lastLoginDate: { type: Date, default: null },
  points: { type: Number, default: 0 },
  activityScore: { type: Number, default: 0 },
  premium: {
    isPremium: { type: Boolean, default: false },
    unlimitedLikes: { type: Boolean, default: false },
    rewindEnabled: { type: Boolean, default: true },
    seeWhoLikedYou: { type: Boolean, default: true }
  },
  qualityScore: { type: Number, default: 0 },
  moderationFlags: { type: Number, default: 0 },
  otpCode: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  resetOtpCode: { type: String, default: null },
  resetOtpExpiresAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });

UserSchema.index({ gender: 1, interestedIn: 1, age: 1, location: 1, qualityVisible: 1, adminBlocked: 1 });

module.exports = mongoose.model('User', UserSchema);
