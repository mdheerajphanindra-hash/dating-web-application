const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messageType: { type: String, enum: ['text', 'gif', 'sticker', 'game_prompt'], default: 'text' },
  messageText: { type: String, required: true, trim: true },
  mediaUrl: { type: String, default: '' },
  suggestionTag: { type: String, default: '' },
  moderationStatus: { type: String, enum: ['clean', 'flagged'], default: 'clean' },
  seen: { type: Boolean, default: false },
  deletedForEveryone: { type: Boolean, default: false },
  deletedForUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

MessageSchema.index({ matchId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);
