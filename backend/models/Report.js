const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: {
    type: String,
    enum: ['fake_profile', 'harassment', 'spam', 'inappropriate_content', 'other'],
    required: true
  },
  details: { type: String, default: '' },
  source: { type: String, default: 'user' },
  status: { type: String, enum: ['open', 'reviewed', 'resolved'], default: 'open' }
}, { timestamps: true });

ReportSchema.index({ reportedUserId: 1, status: 1 });

module.exports = mongoose.model('Report', ReportSchema);
