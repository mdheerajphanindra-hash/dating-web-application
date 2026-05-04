const Report = require('../models/Report');
const User = require('../models/User');

async function reportUser(req, res) {
  try {
    const target = await User.findById(req.params.userId);
    const { reason, details = '' } = req.body;
    if (!target) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const report = await Report.create({
      reporterId: req.user._id,
      reportedUserId: target._id,
      reason,
      details,
      source: 'user'
    });

    return res.status(201).json({ message: 'Report submitted.', report });
  } catch (error) {
    return res.status(500).json({ message: 'Could not submit report.', error: error.message });
  }
}

async function getReports(req, res) {
  const reports = await Report.find()
    .populate('reporterId', 'name email phone')
    .populate('reportedUserId', 'name email phone')
    .sort({ createdAt: -1 });

  return res.json({ reports });
}

async function updateReport(req, res) {
  const { status } = req.body;
  const report = await Report.findById(req.params.reportId);
  if (!report) {
    return res.status(404).json({ message: 'Report not found.' });
  }

  report.status = status || report.status;
  await report.save();
  return res.json({ message: 'Report updated.', report });
}

module.exports = {
  getReports,
  reportUser,
  updateReport
};
