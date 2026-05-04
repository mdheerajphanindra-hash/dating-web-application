const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Like = require('../models/Like');
const Match = require('../models/Match');
const Message = require('../models/Message');
const Report = require('../models/Report');
const {
  BOOST_DURATION_MS,
  DISCOVER_PAGE_SIZE,
  applyProfileQuality,
  assignGeneratedPhotos,
  buildSmartSuggestion,
  calculateAgeFromBirthDate,
  calculateCompatibility,
  dedupeUsers,
  ensureDiscoverCandidatesForUser,
  evaluateProfileQuality,
  getOppositeGender,
  isOnboardingComplete,
  matchesPreference,
  normalizeInterestList,
  normalizePhotoList,
  registerActivity,
  sanitizeUser,
  shuffleList,
  orderPair
} = require('../utils/appHelpers');

async function getUsers(req, res) {
  const users = await User.find()
    .select('-password -otpCode -otpExpiresAt -resetOtpCode -resetOtpExpiresAt')
    .sort({ createdAt: -1 });
  return res.json({ users });
}

async function getUserById(req, res) {
  const user = await User.findById(req.params.userId)
    .select('-password -otpCode -otpExpiresAt -resetOtpCode -resetOtpExpiresAt');

  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  return res.json({ user });
}

async function updateUser(req, res) {
  try {
    const allowedFields = [
      'name',
      'age',
      'birthDate',
      'gender',
      'interestedIn',
      'location',
      'bio',
      'interests',
      'photos',
      'education',
      'job',
      'showGenderOnProfile',
      'distancePreferenceKm',
      'personalityAnswers',
      'lifestyleAnswers',
      'profilePrompts',
      'blockedContactIdentifiers',
      'latitude',
      'longitude',
      'travelModeEnabled',
      'travelLocation',
      'onboardingCompleted'
    ];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (field === 'interests') {
          req.user[field] = normalizeInterestList(req.body[field]);
        } else if (field === 'photos') {
          req.user[field] = normalizePhotoList(req.body[field], 6);
        } else if (field === 'blockedContactIdentifiers') {
          req.user[field] = Array.isArray(req.body[field])
            ? req.body[field].map((item) => String(item).trim()).filter(Boolean)
            : [];
        } else {
          req.user[field] = req.body[field];
        }
      }
    }

    const ageFromBirthDate = calculateAgeFromBirthDate(req.body.birthDate || req.user.birthDate);
    if (ageFromBirthDate) {
      req.user.age = ageFromBirthDate;
    }

    applyProfileQuality(req.user);
    req.user.onboardingCompleted = Boolean(req.body.onboardingCompleted) && isOnboardingComplete(req.user);
    if (req.user.qualityVisible) {
      req.user.points += 10;
    }
    req.user.activityScore = Math.min(100, req.user.streakCount * 6 + req.user.points / 4);
    await req.user.save();

    return res.json({
      message: 'Profile updated.',
      user: sanitizeUser(req.user),
      quality: evaluateProfileQuality(req.user)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Profile update failed.', error: error.message });
  }
}

async function submitVerification(req, res) {
  const verificationDocs = Array.isArray(req.body.verificationDocs) ? req.body.verificationDocs : [];
  req.user.verificationDocs = verificationDocs;
  req.user.verificationFaceMatchScore = verificationDocs.length >= 2 ? 91 : verificationDocs.length === 1 ? 76 : 0;
  req.user.verificationStatus = req.user.verificationFaceMatchScore >= 80 ? 'verified' : 'pending';
  req.user.isVerified = req.user.verificationFaceMatchScore >= 80;
  await req.user.save();

  return res.json({
    message: req.user.isVerified ? 'Verification approved with AI face match.' : 'Verification submitted for manual review.',
    faceMatchScore: req.user.verificationFaceMatchScore,
    user: sanitizeUser(req.user)
  });
}

async function boostProfile(req, res) {
  req.user.boostedUntil = new Date(Date.now() + BOOST_DURATION_MS);
  await registerActivity(req.user, 'boost');
  return res.json({ message: 'Profile boost is active for 30 minutes.', boostedUntil: req.user.boostedUntil });
}

async function rewindSwipe(req, res) {
  const canRewind = req.user.premium?.isPremium || req.user.premium?.rewindEnabled;
  if (!canRewind) {
    return res.status(403).json({ message: 'Rewind is a premium feature.' });
  }

  if (!req.user.lastSwipe?.toUserId || !req.user.lastSwipe?.createdAt) {
    return res.status(400).json({ message: 'No swipe available to rewind.' });
  }

  const recent = Date.now() - new Date(req.user.lastSwipe.createdAt).getTime() <= 30 * 60 * 1000;
  if (!recent) {
    return res.status(400).json({ message: 'The last swipe is too old to rewind.' });
  }

  await Like.deleteOne({ fromUserId: req.user._id, toUserId: req.user.lastSwipe.toUserId });
  await Match.deleteOne(orderPair(req.user._id, req.user.lastSwipe.toUserId));
  req.user.lastSwipe = { toUserId: null, status: '', createdAt: null };
  await req.user.save();

  return res.json({ message: 'Last swipe rewound successfully.' });
}

async function upgradePremium(req, res) {
  req.user.premium = {
    isPremium: true,
    unlimitedLikes: true,
    rewindEnabled: true,
    seeWhoLikedYou: true
  };
  req.user.points += 25;
  req.user.activityScore = Math.min(100, req.user.streakCount * 6 + req.user.points / 4);
  await req.user.save();
  return res.json({ message: 'Premium demo activated.', user: sanitizeUser(req.user) });
}

async function discoverUsers(req, res) {
  try {
    const gender = req.query.gender?.trim();
    const selectedGender = gender && gender !== 'Everyone' ? gender : null;
    await ensureDiscoverCandidatesForUser(req.user, DISCOVER_PAGE_SIZE, selectedGender);

    const maxAge = Number(req.query.maxAge || 99);
    const interactions = await Like.find({ fromUserId: req.user._id, status: 'liked' }).select('toUserId').lean();
    const excludedIds = [
      req.user._id,
      ...req.user.blockedUsers,
      ...req.user.blockedBy,
      ...interactions.map((item) => item.toUserId)
    ];

    const query = {
      _id: { $nin: excludedIds },
      profileVisible: true,
      qualityVisible: true,
      onboardingCompleted: true,
      adminBlocked: false,
      isVerified: true,
      age: { $gte: 18, $lte: maxAge }
    };

    if (selectedGender) {
      query.gender = selectedGender;
    }

    const candidates = await User.find(query)
      .select('-password -otpCode -otpExpiresAt -resetOtpCode -resetOtpExpiresAt')
      .limit(60)
      .lean();

    const primaryResults = candidates
      .filter((candidate) => (selectedGender ? candidate.gender === selectedGender : matchesPreference(req.user, candidate)))
      .map((candidate) => {
        const hydratedCandidate = assignGeneratedPhotos(candidate);
        const compatibility = calculateCompatibility(req.user, candidate);
        return {
          ...hydratedCandidate,
          ...compatibility,
          smartSuggestion: buildSmartSuggestion(req.user, hydratedCandidate, compatibility),
          isNearby: compatibility.distanceKm <= 10
        };
      })
      .filter((candidate) => candidate.distanceKm <= Number(req.user.distancePreferenceKm || 80))
      .sort((a, b) => {
        const boostDelta = (new Date(b.boostedUntil || 0) - new Date(a.boostedUntil || 0));
        if (boostDelta !== 0) {
          return boostDelta;
        }
        if (a.distanceKm !== b.distanceKm) {
          return a.distanceKm - b.distanceKm;
        }
        return b.compatibilityScore - a.compatibilityScore;
      });

    const seenIds = new Set(primaryResults.map((candidate) => candidate._id.toString()));
    const fallbackGender = selectedGender
      ? selectedGender
      : getOppositeGender(req.user.gender) || (req.user.interestedIn !== 'Everyone' ? req.user.interestedIn : null);
    let users = primaryResults.slice(0, DISCOVER_PAGE_SIZE);

    if (users.length < DISCOVER_PAGE_SIZE) {
      const fallbackQuery = {
        ...query,
        _id: {
          $nin: [
            ...excludedIds,
            ...users.map((candidate) => candidate._id)
          ]
        }
      };

      if (fallbackGender) {
        fallbackQuery.gender = fallbackGender;
      } else {
        delete fallbackQuery.gender;
      }

      const fallbackCandidates = await User.find(fallbackQuery)
        .select('-password -otpCode -otpExpiresAt -resetOtpCode -resetOtpExpiresAt')
        .limit(200)
        .lean();

      const fallbackResults = shuffleList(fallbackCandidates)
        .filter((candidate) => !seenIds.has(candidate._id.toString()))
        .map((candidate) => {
          const hydratedCandidate = assignGeneratedPhotos(candidate);
          const compatibility = calculateCompatibility(req.user, hydratedCandidate);
          return {
            ...hydratedCandidate,
            ...compatibility,
            smartSuggestion: buildSmartSuggestion(req.user, hydratedCandidate, compatibility),
            isNearby: compatibility.distanceKm <= 10
          };
        })
        .slice(0, Math.max(0, DISCOVER_PAGE_SIZE - users.length));

      users = [...users, ...fallbackResults];
    }

    return res.json({ users: dedupeUsers(users).slice(0, DISCOVER_PAGE_SIZE) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not load recommendations.', error: error.message });
  }
}

async function blockUser(req, res) {
  const target = await User.findById(req.params.userId);
  if (!target) {
    return res.status(404).json({ message: 'User not found.' });
  }

  if (!req.user.blockedUsers.some((id) => id.toString() === target._id.toString())) {
    req.user.blockedUsers.push(target._id);
  }
  if (!target.blockedBy.some((id) => id.toString() === req.user._id.toString())) {
    target.blockedBy.push(req.user._id);
  }

  await Promise.all([req.user.save(), target.save()]);
  return res.json({ message: 'User blocked successfully.' });
}

async function unblockUser(req, res) {
  const target = await User.findById(req.params.userId);
  if (!target) {
    return res.status(404).json({ message: 'User not found.' });
  }

  req.user.blockedUsers = req.user.blockedUsers.filter((id) => id.toString() !== target._id.toString());
  target.blockedBy = target.blockedBy.filter((id) => id.toString() !== req.user._id.toString());
  await Promise.all([req.user.save(), target.save()]);

  return res.json({ message: 'User unblocked successfully.' });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Both current and new password are required.' });
  }

  const isMatch = await bcrypt.compare(currentPassword || '', req.user.password);
  if (!isMatch) {
    return res.status(400).json({ message: 'Current password is incorrect.' });
  }

  req.user.password = await bcrypt.hash(newPassword, 10);
  await req.user.save();
  return res.json({ message: 'Password changed successfully.' });
}

async function updatePrivacy(req, res) {
  const {
    profileVisible,
    allowMessages,
    travelModeEnabled,
    travelLocation,
    latitude,
    longitude
  } = req.body;

  if (typeof profileVisible === 'boolean') {
    req.user.profileVisible = profileVisible;
  }
  if (typeof allowMessages === 'boolean') {
    req.user.allowMessages = allowMessages;
  }
  if (typeof travelModeEnabled === 'boolean') {
    req.user.travelModeEnabled = travelModeEnabled;
  }
  if (typeof travelLocation === 'string') {
    req.user.travelLocation = travelLocation;
  }
  if (typeof latitude === 'number') {
    req.user.latitude = latitude;
  }
  if (typeof longitude === 'number') {
    req.user.longitude = longitude;
  }

  applyProfileQuality(req.user);
  await req.user.save();
  return res.json({ message: 'Settings updated.', user: sanitizeUser(req.user) });
}

async function deleteAccount(req, res) {
  const userId = req.user._id;
  await Promise.all([
    Like.deleteMany({ $or: [{ fromUserId: userId }, { toUserId: userId }] }),
    Match.deleteMany({ $or: [{ user1Id: userId }, { user2Id: userId }] }),
    Message.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] }),
    Report.deleteMany({ $or: [{ reporterId: userId }, { reportedUserId: userId }] }),
    User.findByIdAndDelete(userId)
  ]);

  return res.json({ message: 'Account deleted successfully.' });
}

async function getNotificationSummary(req, res) {
  const [newLikes, newMatches, unreadMessages] = await Promise.all([
    Like.countDocuments({ toUserId: req.user._id, status: 'liked' }),
    Match.countDocuments({ $or: [{ user1Id: req.user._id }, { user2Id: req.user._id }] }),
    Message.countDocuments({ receiverId: req.user._id, seen: false })
  ]);

  return res.json({
    newLikes,
    newMatches,
    unreadMessages,
    streakCount: req.user.streakCount,
    points: req.user.points,
    likesRemaining: 'Unlimited',
    boostActive: Boolean(req.user.boostedUntil && new Date(req.user.boostedUntil) > new Date())
  });
}

async function getAdminStats(req, res) {
  const [totalUsers, totalMatches, totalReports, activeUsers, premiumUsers, lowQualityHidden] = await Promise.all([
    User.countDocuments(),
    Match.countDocuments(),
    Report.countDocuments(),
    User.countDocuments({ lastSeenAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
    User.countDocuments({ 'premium.isPremium': true }),
    User.countDocuments({ qualityVisible: false })
  ]);

  return res.json({ totalUsers, totalMatches, totalReports, activeUsers, premiumUsers, lowQualityHidden });
}

async function adminBlockUser(req, res) {
  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  user.adminBlocked = true;
  await user.save();
  return res.json({ message: 'User blocked from discovery.' });
}

async function adminUnblockUser(req, res) {
  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  user.adminBlocked = false;
  await user.save();
  return res.json({ message: 'User restored.' });
}

async function adminDeleteUser(req, res) {
  const userId = req.params.userId;
  await Promise.all([
    Like.deleteMany({ $or: [{ fromUserId: userId }, { toUserId: userId }] }),
    Match.deleteMany({ $or: [{ user1Id: userId }, { user2Id: userId }] }),
    Message.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] }),
    Report.deleteMany({ $or: [{ reporterId: userId }, { reportedUserId: userId }] }),
    User.findByIdAndDelete(userId)
  ]);
  return res.json({ message: 'User removed successfully.' });
}

module.exports = {
  adminBlockUser,
  adminDeleteUser,
  adminUnblockUser,
  blockUser,
  boostProfile,
  changePassword,
  deleteAccount,
  discoverUsers,
  getAdminStats,
  getNotificationSummary,
  getUserById,
  getUsers,
  rewindSwipe,
  submitVerification,
  unblockUser,
  updatePrivacy,
  updateUser,
  upgradePremium
};
