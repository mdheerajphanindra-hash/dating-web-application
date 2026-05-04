const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  user1Id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  user2Id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  matchDate: { type: Date, default: Date.now },
  lastMessageAt: { type: Date, default: Date.now }
}, { timestamps: true });

MatchSchema.index({ user1Id: 1, user2Id: 1 }, { unique: true });

module.exports = mongoose.model('Match', MatchSchema);
