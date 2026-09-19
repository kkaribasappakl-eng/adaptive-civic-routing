const express = require('express');
const router = express.Router();
const {
  routeComplaintHandler,
  getComplaintRoutingHandler,
  listRoutingDecisionsHandler,
  getRoutingDecisionHandler
} = require('../controllers/routingController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// List routing decisions (Operator / Admin)
router.get('/decisions', requireAuth, requireRole('OPERATOR', 'ADMIN'), listRoutingDecisionsHandler);

// Single decision by ID (Operator / Admin)
router.get('/decisions/:id', requireAuth, requireRole('OPERATOR', 'ADMIN'), getRoutingDecisionHandler);

// Explicitly trigger routing for a complaint (Operator / Admin)
router.post('/complaints/:complaintId/route', requireAuth, requireRole('OPERATOR', 'ADMIN'), routeComplaintHandler);

// Get a complaint's routing result (Public citizen tracking access)
router.get('/complaints/:complaintId/routing', getComplaintRoutingHandler);

module.exports = router;
