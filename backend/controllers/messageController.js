const User = require('../models/User');
const Message = require('../models/Message');
const Match = require('../models/Match');
const Report = require('../models/Report');

const {
  ICEBREAKER_PROMPTS,
  assignGeneratedPhotos,
  buildSuggestedReplies,
  detectModerationIssue,
  ensureMatchAccess,
  getSocketIo,
  isMatchStarredForUser,
  registerActivity
} = require('../utils/appHelpers');

async function getMessages(req, res) {
  const match = await ensureMatchAccess(req.params.matchId, req.user._id);
  if (!match) {
    return res.status(404).json({ message: 'Match not found.' });
  }

  const otherUserId = match.user1Id.toString() === req.user._id.toString() ? match.user2Id : match.user1Id;
  const [messages, rawOtherUser] = await Promise.all([
    Message.find({
      matchId: match._id,
      deletedForUsers: { $ne: req.user._id }
    }).sort({ createdAt: 1 }),
    User.findById(otherUserId).select('-password -otpCode -otpExpiresAt -resetOtpCode -resetOtpExpiresAt').lean()
  ]);
  const otherUser = rawOtherUser ? assignGeneratedPhotos(rawOtherUser) : null;

  const lastMessage = messages[messages.length - 1];
  const suggestions = buildSuggestedReplies(lastMessage?.messageText);

  return res.json({
    messages,
    otherUser,
    match: {
      _id: match._id,
      isStarred: isMatchStarredForUser(match, req.user._id)
    },
    icebreakers: messages.length ? [] : ICEBREAKER_PROMPTS.slice(0, 3),
    suggestedReplies: suggestions
  });
}

async function sendMessage(req, res) {
  try {
    const match = await ensureMatchAccess(req.params.matchId, req.user._id);
    const { messageText, messageType = 'text', mediaUrl = '', suggestionTag = '' } = req.body;
    if (!match) {
      return res.status(404).json({ message: 'Match not found.' });
    }

    const moderationIssue = detectModerationIssue(messageText);
    if (moderationIssue && moderationIssue !== 'empty') {
      req.user.moderationFlags += 1;
      await req.user.save();
      await Report.create({
        reporterId: req.user._id,
        reportedUserId: req.user._id,
        reason: moderationIssue === 'spam' ? 'spam' : 'harassment',
        details: 'Auto-flagged by content moderation.',
        source: 'ai_moderation'
      });
      return res.status(400).json({ message: 'Message blocked by AI safety moderation.' });
    }

    if (!messageText || !messageText.trim()) {
      return res.status(400).json({ message: 'Message text is required.' });
    }

    const receiverId = match.user1Id.toString() === req.user._id.toString() ? match.user2Id : match.user1Id;
    const receiver = await User.findById(receiverId).lean();
    if (
      !receiver ||
      receiver.allowMessages === false ||
      receiver.blockedUsers.some((id) => id.toString() === req.user._id.toString())
    ) {
      return res.status(403).json({ message: 'You cannot message this user.' });
    }

    const existingCount = await Message.countDocuments({ matchId: match._id, senderId: req.user._id });
    const message = await Message.create({
      matchId: match._id,
      senderId: req.user._id,
      receiverId,
      messageType,
      messageText: messageText.trim(),
      mediaUrl,
      suggestionTag
    });

    if (existingCount === 0) {
      await registerActivity(req.user, 'first_message');
    }

    match.lastMessageAt = new Date();
    await match.save();

    const io = getSocketIo();
    const payload = { ...message.toObject(), matchId: match._id.toString() };
    if (io) {
      io.to(`user:${receiverId.toString()}`).emit('message:new', payload);
    }
    return res.status(201).json({ message: 'Message sent.', data: message });
  } catch (error) {
    return res.status(500).json({ message: 'Could not send message.', error: error.message });
  }
}

async function markMessagesSeen(req, res) {
  const match = await ensureMatchAccess(req.params.matchId, req.user._id);
  if (!match) {
    return res.status(404).json({ message: 'Match not found.' });
  }

  await Message.updateMany({ matchId: match._id, receiverId: req.user._id, seen: false }, { seen: true });
  return res.json({ message: 'Messages marked as seen.' });
}

async function deleteMessage(req, res) {
  const match = await ensureMatchAccess(req.params.matchId, req.user._id);
  if (!match) {
    return res.status(404).json({ message: 'Match not found.' });
  }

  const message = await Message.findById(req.params.messageId);
  if (!message || message.matchId.toString() !== match._id.toString()) {
    return res.status(404).json({ message: 'Message not found.' });
  }

  if (message.senderId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Only the sender can delete this message.' });
  }

  const scope = req.body?.scope === 'me' ? 'me' : 'everyone';
  const io = getSocketIo();

  if (scope === 'me') {
    if (!message.deletedForUsers.some((id) => id.toString() === req.user._id.toString())) {
      message.deletedForUsers.push(req.user._id);
      await message.save();
    }

    if (io) {
      io.to(`user:${req.user._id.toString()}`).emit('message:deleted', {
        messageId: message._id.toString(),
        matchId: match._id.toString(),
        scope: 'me',
        userId: req.user._id.toString()
      });
    }
    return res.json({ message: 'Message deleted from your chat.' });
  }

  message.deletedForEveryone = true;
  message.messageText = 'Message deleted';
  await message.save();

  if (io) {
    io.to(`user:${message.receiverId.toString()}`).emit('message:deleted', {
      messageId: message._id.toString(),
      matchId: match._id.toString(),
      scope: 'everyone',
      userId: req.user._id.toString()
    });
    io.to(`user:${req.user._id.toString()}`).emit('message:deleted', {
      messageId: message._id.toString(),
      matchId: match._id.toString(),
      scope: 'everyone',
      userId: req.user._id.toString()
    });
  }

  return res.json({ message: 'Message deleted for everyone.' });
}

module.exports = {
  deleteMessage,
  getMessages,
  markMessagesSeen,
  sendMessage
};
