const express = require('express');
const router = express.Router();
const { getHealth, getLiveness, getReadiness } = require('../controllers/healthController');

// Standard Health & Diagnostics
router.get('/health', getHealth);

// Cloud Orchestration Health Probes
router.get('/health/live', getLiveness);
router.get('/health/ready', getReadiness);

module.exports = router;
