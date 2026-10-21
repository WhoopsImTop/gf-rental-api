const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { requireStaff } = require('../middleware/requireStaff');

// Pro Seitenaufruf gehen ein Pageview- und ein Verweildauer-Event ein.
const analyticsTrackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many analytics events from this IP, please try again later",
});

const checkoutEventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many checkout events from this IP, please try again later",
});

const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many client error reports from this IP, please try again later",
});

// Public route for frontend tracking. sendBeacon sendet text/plain (CORS-safelisted,
// kein Preflight); application/json wird weiterhin vom globalen Parser gelesen.
router.post(
  '/track',
  analyticsTrackLimiter,
  express.text({ type: 'text/plain', limit: '8kb' }),
  analyticsController.trackVisit,
);
router.post(
  '/checkout-event',
  checkoutEventLimiter,
  analyticsController.trackCheckoutEvent,
);
router.post(
  '/client-error',
  clientErrorLimiter,
  analyticsController.trackClientError,
);

// Protected route for CRM dashboard
router.get('/stats', ...requireStaff, analyticsController.getStats);

module.exports = router;
