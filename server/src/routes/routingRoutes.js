const express = require('express');
const router = express.Router();
const {
  routeComplaintHandler,
  getComplaintRoutingHandler,
  listRoutingDecisionsHandler,
  getRoutingDecisionHandler
} = require('../controllers/routingController');

// List routing decisions
router.get('/decisions', listRoutingDecisionsHandler);

// Single decision by ID
router.get('/decisions/:id', getRoutingDecisionHandler);

// Route a complaint (POST) & Get its routing decision (GET)
router.post('/complaints/:complaintId/route', routeComplaintHandler);
router.get('/complaints/:complaintId/routing', getComplaintRoutingHandler);

module.exports = router;
