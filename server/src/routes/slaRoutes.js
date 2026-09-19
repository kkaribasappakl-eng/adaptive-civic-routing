const express = require('express');
const router = express.Router();
const {
  getSlaRulesHandler,
  getSlaOverviewHandler
} = require('../controllers/slaController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// Operational SLA rules & metrics require OPERATOR or ADMIN role
router.use(requireAuth, requireRole('OPERATOR', 'ADMIN'));

// GET /api/sla/rules
router.get('/rules', getSlaRulesHandler);

// GET /api/sla/overview
router.get('/overview', getSlaOverviewHandler);

module.exports = router;
