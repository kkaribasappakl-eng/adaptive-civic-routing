const express = require('express');
const router = express.Router();
const {
  listVersions,
  getVersion,
  previewVersion,
  activateVersion,
  compareVersions,
  getBoundaries,
  setupDemoV2,
  getAuditHistory
} = require('../controllers/jurisdictionController');

router.get('/versions', listVersions);
router.get('/versions/compare', compareVersions);
router.get('/versions/:versionId', getVersion);
router.post('/versions/:versionId/preview', previewVersion);
router.post('/versions/:versionId/activate', activateVersion);
router.get('/boundaries', getBoundaries);
router.post('/demo-v2-setup', setupDemoV2);
router.get('/audit', getAuditHistory);

module.exports = router;
