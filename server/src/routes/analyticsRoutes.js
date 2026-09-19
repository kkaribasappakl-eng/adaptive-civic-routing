const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

/**
 * Stage 11: Operational Analytics & Routing Intelligence API Routes
 * Restricted to OPERATOR and ADMIN roles.
 * All endpoints are READ-ONLY (GET).
 */
router.use(requireAuth, requireRole('OPERATOR', 'ADMIN'));

router.get('/overview', analyticsController.getOverview);
router.get('/trends', analyticsController.getTrends);
router.get('/categories', analyticsController.getCategories);
router.get('/authorities', analyticsController.getAuthorities);
router.get('/departments', analyticsController.getDepartments);
router.get('/routing', analyticsController.getRouting);
router.get('/sla', analyticsController.getSla);
router.get('/reviews', analyticsController.getReviews);
router.get('/jurisdictions', analyticsController.getJurisdictions);
router.get('/spatial', analyticsController.getSpatial);

module.exports = router;
