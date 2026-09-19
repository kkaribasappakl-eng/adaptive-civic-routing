const express = require('express');
const router = express.Router();
const {
  listVersions,
  getVersion,
  createVersion,
  validateVersion,
  previewVersion,
  activateVersion,
  compareVersions,
  getBoundaries,
  setupDemoV2,
  getAuditHistory
} = require('../controllers/jurisdictionController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// Privileged ADMIN-only operations (Draft creation, boundary validation, version activation, demo reset)
router.post('/versions', requireAuth, requireRole('ADMIN'), createVersion);
router.post('/versions/:versionId/validate', requireAuth, requireRole('ADMIN'), validateVersion);
router.post('/versions/:versionId/activate', requireAuth, requireRole('ADMIN'), activateVersion);
router.post('/demo-v2-setup', requireAuth, requireRole('ADMIN'), setupDemoV2);

// Read-only / preview operations accessible to OPERATOR and ADMIN
router.get('/versions', requireAuth, requireRole('OPERATOR', 'ADMIN'), listVersions);
router.get('/versions/compare', requireAuth, requireRole('OPERATOR', 'ADMIN'), compareVersions);
router.get('/versions/history', requireAuth, requireRole('OPERATOR', 'ADMIN'), getAuditHistory);
router.get('/versions/:versionId', requireAuth, requireRole('OPERATOR', 'ADMIN'), getVersion);
router.get('/versions/:versionId/preview', requireAuth, requireRole('OPERATOR', 'ADMIN'), previewVersion);
router.post('/versions/:versionId/preview', requireAuth, requireRole('OPERATOR', 'ADMIN'), previewVersion);
router.get('/audit', requireAuth, requireRole('OPERATOR', 'ADMIN'), getAuditHistory);

// Boundaries can be fetched by authenticated operators/admins, or fallback for interactive map layers
router.get('/boundaries', getBoundaries);

module.exports = router;
