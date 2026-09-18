const express = require('express');
const router = express.Router();
const {
  getSlaRulesHandler,
  getSlaOverviewHandler
} = require('../controllers/slaController');

// GET /api/sla/rules
router.get('/rules', getSlaRulesHandler);

// GET /api/sla/overview
router.get('/overview', getSlaOverviewHandler);

module.exports = router;
