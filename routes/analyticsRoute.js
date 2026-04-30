const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken } = require('../middleware/authMiddleware');

const analyticsTrackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many analytics events from this IP, please try again later",
});

// Public route for frontend tracking
router.post('/track', analyticsTrackLimiter, analyticsController.trackVisit);

// Protected route for CRM dashboard
router.get('/stats', authenticateToken, analyticsController.getStats);

module.exports = router;
