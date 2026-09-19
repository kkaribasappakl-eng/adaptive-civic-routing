const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth, requireRole, loginRateLimiter } = require('../middleware/authMiddleware');

// Public authentication endpoints
router.post('/register', authController.register);
router.post('/login', loginRateLimiter, authController.login);
router.post('/demo-login', authController.demoLogin);
router.post('/logout', authController.logout);

// Authenticated user profile
router.get('/me', requireAuth, authController.getMe);

// Admin-only user provisioning
router.post('/users', requireAuth, requireRole('ADMIN'), authController.provisionUser);

module.exports = router;
