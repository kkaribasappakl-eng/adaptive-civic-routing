const auditService = require('../services/auditService');

/**
 * Stage 13: Read-Only Audit Log Query
 * GET /api/audit
 * Access: OPERATOR (operational logs only), ADMIN (all internal logs)
 */
const getAuditLogs = async (req, res, next) => {
  try {
    const userRole = req.user?.role || 'OPERATOR';
    const result = await auditService.queryAuditLogs(req.query, userRole);

    res.status(200).json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Stage 13: Single Audit Log Record Lookup
 * GET /api/audit/:id
 */
const getAuditLogById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role || 'OPERATOR';
    const log = await auditService.getAuditLogById(id, userRole);

    if (!log) {
      return res.status(404).json({
        success: false,
        error: `Audit log record '${id}' not found or access restricted.`
      });
    }

    res.status(200).json({
      success: true,
      data: log
    });
  } catch (error) {
    if (error.status === 403) {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
};

/**
 * Stage 13: Audit Summary Metrics
 * GET /api/audit/summary
 */
const getAuditSummary = async (req, res, next) => {
  try {
    const userRole = req.user?.role || 'OPERATOR';
    const summary = await auditService.getAuditSummary(userRole);

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogById,
  getAuditSummary
};
