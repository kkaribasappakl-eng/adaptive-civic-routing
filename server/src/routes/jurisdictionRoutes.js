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

// Version management endpoints
router.get('/versions', listVersions);
router.post('/versions', createVersion);
router.get('/versions/compare', compareVersions);
router.get('/versions/history', getAuditHistory);
router.get('/versions/:versionId', getVersion);
router.post('/versions/:versionId/validate', validateVersion);
router.get('/versions/:versionId/preview', previewVersion);
router.post('/versions/:versionId/preview', previewVersion);
router.post('/versions/:versionId/activate', activateVersion);

// Boundary, demo, and audit history endpoints
router.get('/boundaries', getBoundaries);
router.post('/demo-v2-setup', setupDemoV2);
router.get('/audit', getAuditHistory);

module.exports = router;
