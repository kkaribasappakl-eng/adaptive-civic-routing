const express = require('express');
const router = express.Router();
const { getDatabaseStatus } = require('../controllers/systemController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// Internal database diagnostic endpoint (Operator / Admin)
router.get('/database', requireAuth, requireRole('OPERATOR', 'ADMIN'), getDatabaseStatus);

module.exports = router;
