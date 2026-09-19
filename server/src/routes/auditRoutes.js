const express = require('express');
const router = express.Router();
const {
  getAuditLogs,
  getAuditLogById,
  getAuditSummary
} = require('../controllers/auditController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// Summary statistics for audit dashboard
router.get('/summary', requireAuth, requireRole('OPERATOR', 'ADMIN'), getAuditSummary);

// Paginated audit log querying with filters
router.get('/', requireAuth, requireRole('OPERATOR', 'ADMIN'), getAuditLogs);

// Single audit log record detail
router.get('/:id', requireAuth, requireRole('OPERATOR', 'ADMIN'), getAuditLogById);

// Explicit immutability rejection for write/mutation verbs
router.all('/:id', (req, res) => {
  if (['PATCH', 'DELETE', 'PUT', 'POST'].includes(req.method)) {
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed: Audit logs are strictly immutable and cannot be updated or deleted.`
    });
  }
  res.status(405).json({ success: false, error: 'Method Not Allowed' });
});

router.all('/', (req, res) => {
  if (['PATCH', 'DELETE', 'PUT'].includes(req.method)) {
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed: Audit logs are strictly immutable and cannot be updated or deleted.`
    });
  }
  res.status(405).json({ success: false, error: 'Method Not Allowed' });
});

module.exports = router;
