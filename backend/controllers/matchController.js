const User = require('../models/User');
const Like = require('../models/Like');
const Match = require('../models/Match');
const Message = require('../models/Message');

const {
  DISCOVER_PAGE_SIZE,
  assignGeneratedPhotos,
  buildGeneratedProfilesForGenders,
  buildSmartSuggestion,
  calculateCompatibility,
  dedupeProfileCards,
  ensureMatchAccess,
  ensureSeededMatchesForUser,
  getSocketIo,
  getOppositeGender,
  isMatchStarredForUser,
  orderPair,
  resolveTargetUser,
  shuffleList
} = require('../utils/appHelpers');

async function getMatches(req, res) {
  await ensureSeededMatchesForUser(req.user);
  const requestedGender = req.query.gender?.trim();
  const selectedGender = requestedGender && requestedGender !== 'Everyone'
    ? requestedGender
    : (req.user.interestedIn && req.user.interestedIn !== 'Everyone' ? req.user.interestedIn : null);
  const generatedFallbackGenders = selectedGender ? [selectedGender] : ['Male', 'Female'];

  const matches = await Match.find({
    $or: [{ user1Id: req.user._id }, { user2Id: req.user._id }]
  }).sort({ lastMessageAt: -1, createdAt: -1 });

  const hydrated = dedupeProfileCards((await Promise.all(matches.map(async (match) => {
    const otherUserId = match.user1Id.toString() === req.user._id.toString() ? match.user2Id : match.user1Id;
    const [rawOtherUser, lastMessage] = await Promise.all([
      User.findById(otherUserId).select('-password -otpCode -otpExpiresAt -resetOtpCode -resetOtpExpiresAt').lean(),
      Message.findOne({ matchId: match._id }).sort({ createdAt: -1 }).lean()
    ]);
    const otherUser = rawOtherUser ? assignGeneratedPhotos(rawOtherUser) : null;
    const compatibility = otherUser ? calculateCompatibility(req.user, otherUser) : { compatibilityScore: 60, reasons: ['Basic match'] };

    return {
      ...match.toObject(),
      otherUser,
      lastMessage,
      isStarred: isMatchStarredForUser(match, req.user._id),
      compatibilityScore: compatibility.compatibilityScore,
      compatibilityReasons: compatibility.reasons
    };
  })))
    .filter((match) => !selectedGender || match.otherUser?.gender === selectedGender), (item) => item.otherUser)
    .sort((a, b) => {
      if (a.isStarred !== b.isStarred) {
        return Number(b.isStarred) - Number(a.isStarred);
      }

      return new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime();
    });

  const likeInteractions = await Like.find({
    $or: [{ fromUserId: req.user._id }, { toUserId: req.user._id }]
  }).select('fromUserId toUserId').lean();

  const excludedIds = new Set([
    req.user._id.toString(),
    ...req.user.blockedUsers.map((id) => id.toString()),
    ...req.user.blockedBy.map((id) => id.toString()),
    ...hydrated.map((match) => String(match.otherUser?._id || '')),
    ...likeInteractions.flatMap((item) => [item.fromUserId?.toString(), item.toUserId?.toString()]).filter(Boolean)
  ]);

  const suggestionQuery = {
    _id: { $nin: Array.from(excludedIds) },
    profileVisible: true,
    qualityVisible: true,
    onboardingCompleted: true,
    adminBlocked: false,
    isVerified: true
  };

  if (selectedGender) {
    suggestionQuery.gender = selectedGender;
  }

  const fallbackMatches = shuffleList(
    await User.find(suggestionQuery)
      .select('-password -otpCode -otpExpiresAt -resetOtpCode -resetOtpExpiresAt')
      .limit(200)
      .lean()
  )
    .map((candidate) => {
      const otherUser = assignGeneratedPhotos(candidate);
      const compatibility = calculateCompatibility(req.user, otherUser);
      return {
        _id: `suggested-${candidate._id.toString()}`,
        otherUser,
        compatibilityScore: compatibility.compatibilityScore,
        compatibilityReasons: compatibility.reasons,
        smartSuggestion: buildSmartSuggestion(req.user, otherUser, compatibility),
        isSuggested: true
      };
    })
    .slice(0, DISCOVER_PAGE_SIZE);

  const generatedMatches = fallbackMatches.length < DISCOVER_PAGE_SIZE
    ? buildGeneratedProfilesForGenders(generatedFallbackGenders, DISCOVER_PAGE_SIZE - fallbackMatches.length)
    : [];

  return res.json({
    matches: hydrated,
    fallbackMatches: dedupeProfileCards(
      [...fallbackMatches, ...generatedMatches],
      (item) => item.otherUser,
      hydrated
    )
  });
}

async function connectMatch(req, res) {
  try {
    const { userId, profilePreview } = req.body || {};
    if (!userId) {
      return res.status(400).json({ message: 'A profile is required to connect.' });
    }

    if (req.user._id.toString() === userId) {
      return res.status(400).json({ message: 'You cannot connect to yourself.' });
    }

    const targetUser = await resolveTargetUser(req.user, userId, profilePreview);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target profile not found.' });
    }
    const resolvedUserId = targetUser._id.toString();

    if (
      req.user.blockedUsers.some((id) => id.toString() === resolvedUserId) ||
      req.user.blockedBy.some((id) => id.toString() === resolvedUserId) ||
      (targetUser.blockedUsers || []).some((id) => id.toString() === req.user._id.toString())
    ) {
      return res.status(403).json({ message: 'You cannot connect to this profile.' });
    }

    await Like.findOneAndUpdate(
      { fromUserId: req.user._id, toUserId: resolvedUserId },
      { status: 'liked' },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const pair = orderPair(req.user._id, resolvedUserId);
    let match = await Match.findOne(pair);
    if (!match) {
      match = await Match.create(pair);
    }

    const io = getSocketIo();
    if (io) {
      io.to(`user:${resolvedUserId}`).emit('like:received', { fromUserId: req.user._id.toString() });
      io.to(`user:${req.user._id.toString()}`).emit('match:new', { matchId: match._id, userId: resolvedUserId });
      io.to(`user:${resolvedUserId}`).emit('match:new', { matchId: match._id, userId: req.user._id.toString() });
    }

    return res.json({
      message: `You are now connected with ${targetUser.name || 'this profile'}.`,
      matchId: match._id,
      userId: resolvedUserId
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not connect to this profile.', error: error.message });
  }
}

async function updateMatchStar(req, res) {
  try {
    const match = await ensureMatchAccess(req.params.matchId, req.user._id);
    const { starred } = req.body;

    if (!match) {
      return res.status(404).json({ message: 'Match not found.' });
    }

    if (typeof starred !== 'boolean') {
      return res.status(400).json({ message: 'A valid starred state is required.' });
    }

    match.starredBy = starred
      ? [...new Set([...(match.starredBy || []).map((id) => id.toString()), req.user._id.toString()])]
      : (match.starredBy || []).filter((id) => id.toString() !== req.user._id.toString());

    await match.save();

    return res.json({
      message: starred ? 'Conversation starred.' : 'Conversation unstarred.',
      matchId: match._id,
      isStarred: isMatchStarredForUser(match, req.user._id)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update conversation star.', error: error.message });
  }
}

module.exports = {
  connectMatch,
  getMatches,
  updateMatchStar
};
