const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Public route for frontend tracking
router.post('/track', analyticsController.trackVisit);

// Protected route for CRM dashboard
router.get('/stats', authenticateToken, analyticsController.getStats);

module.exports = router;
