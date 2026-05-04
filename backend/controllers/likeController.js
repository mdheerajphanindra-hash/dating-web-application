const Like = require('../models/Like');

const {
  assignGeneratedPhotos,
  createMatchIfMutual,
  dedupeLikeItems,
  getSocketIo,
  registerActivity,
  resolveTargetUser,
  sameDay
} = require('../utils/appHelpers');

async function likeUser(req, res) {
  try {
    const { toUserId, status, profilePreview } = req.body || {};
    if (!toUserId || !['liked', 'skipped'].includes(status)) {
      return res.status(400).json({ message: 'Invalid swipe action.' });
    }

    if (req.user._id.toString() === toUserId) {
      return res.status(400).json({ message: 'You cannot swipe on yourself.' });
    }

    if (!sameDay(req.user.dailyLikeDate, new Date())) {
      req.user.dailyLikeCount = 0;
      req.user.dailyLikeDate = new Date();
    }

    const targetUser = await resolveTargetUser(req.user, toUserId, profilePreview);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found.' });
    }
    const resolvedUserId = targetUser._id.toString();

    if (
      req.user.blockedUsers.some((id) => id.toString() === resolvedUserId) ||
      (targetUser.blockedUsers || []).some((id) => id.toString() === req.user._id.toString())
    ) {
      return res.status(403).json({ message: 'This user is blocked.' });
    }

    await Like.findOneAndUpdate(
      { fromUserId: req.user._id, toUserId: resolvedUserId },
      { status },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (status === 'liked') {
      req.user.dailyLikeCount += 1;
      const io = getSocketIo();
      if (io) {
        io.to(`user:${resolvedUserId}`).emit('like:received', { fromUserId: req.user._id.toString() });
      }
      await registerActivity(req.user, 'like');
    } else {
      await req.user.save();
    }

    req.user.lastSwipe = { toUserId: resolvedUserId, status, createdAt: new Date() };
    await req.user.save();

    const match = status === 'liked' ? await createMatchIfMutual(req.user._id, resolvedUserId) : null;

    return res.json({
      message: match ? 'It is a match!' : `Profile ${status}.`,
      match,
      likesRemaining: 'Unlimited'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not save swipe.', error: error.message });
  }
}

async function getReceivedLikes(req, res) {
  const likes = await Like.find({ toUserId: req.user._id, status: 'liked' })
    .populate('fromUserId', '-password -otpCode -otpExpiresAt -resetOtpCode -resetOtpExpiresAt')
    .sort({ createdAt: -1 });

  const hydratedLikes = likes.map((like) => {
    const value = like.toObject();
    return {
      ...value,
      fromUserId: value.fromUserId ? assignGeneratedPhotos(value.fromUserId) : value.fromUserId
    };
  });
  const uniqueLikes = dedupeLikeItems(hydratedLikes, 'fromUserId');

  return res.json({
    likes: uniqueLikes,
    premiumLocked: !req.user.premium?.seeWhoLikedYou,
    teaserCount: uniqueLikes.length
  });
}

async function getSentLikes(req, res) {
  const likes = await Like.find({ fromUserId: req.user._id, status: 'liked' })
    .populate('toUserId', '-password -otpCode -otpExpiresAt -resetOtpCode -resetOtpExpiresAt')
    .sort({ createdAt: -1 });

  const hydratedLikes = likes.map((like) => {
    const value = like.toObject();
    return {
      ...value,
      toUserId: value.toUserId ? assignGeneratedPhotos(value.toUserId) : value.toUserId
    };
  });

  return res.json({ likes: dedupeLikeItems(hydratedLikes, 'toUserId') });
}

async function removeSentLikeById(req, res) {
  const like = await Like.findOneAndDelete({
    _id: req.params.likeId,
    fromUserId: req.user._id,
    status: 'liked'
  });

  if (!like) {
    return res.status(404).json({ message: 'Liked profile not found.' });
  }

  return res.json({ message: 'Liked profile removed.' });
}

async function removeAllSentLikes(req, res) {
  const result = await Like.deleteMany({
    fromUserId: req.user._id,
    status: 'liked'
  });

  return res.json({
    message: result.deletedCount ? 'All liked profiles removed.' : 'No liked profiles to remove.'
  });
}

async function removeSentLike(req, res) {
  const { likeId, toUserId } = req.body || {};
  const query = {
    fromUserId: req.user._id,
    status: 'liked'
  };

  if (likeId) {
    query._id = likeId;
  } else if (toUserId) {
    query.toUserId = toUserId;
  } else {
    return res.status(400).json({ message: 'Liked profile id is required.' });
  }

  const like = await Like.findOneAndDelete(query);

  if (!like) {
    return res.status(404).json({ message: 'Liked profile not found.' });
  }

  return res.json({ message: 'Liked profile removed.' });
}

module.exports = {
  getLikes: getSentLikes,
  getReceivedLikes,
  getSentLikes,
  likeUser,
  removeAllSentLikes,
  removeSentLike,
  removeSentLikeById
};
