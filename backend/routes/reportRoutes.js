const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { getReports, updateReport } = require('../controllers/reportController');

const router = express.Router();

router.get('/', authMiddleware, adminMiddleware, getReports);
router.patch('/:reportId', authMiddleware, adminMiddleware, updateReport);

module.exports = router;
