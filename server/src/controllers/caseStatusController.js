const caseStatusService = require('../services/caseStatusService');

/**
 * Updates a complaint's status with deterministic transition validation
 * PATCH /api/complaints/:complaintId/status
 */
const updateStatusHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { status, reason, changedBy, metadata } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Target "status" is required in request body.'
      });
    }

    const result = await caseStatusService.updateComplaintStatus(
      complaintId,
      status,
      reason,
      changedBy || 'civic_operator',
      metadata
    );

    res.status(200).json({
      success: true,
      message: `Complaint status updated from '${result.previousStatus}' to '${result.newStatus}'`,
      data: result
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
};

/**
 * Fetches chronological status history for a complaint
 * GET /api/complaints/:complaintId/status-history
 */
const getStatusHistoryHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const history = await caseStatusService.getComplaintStatusHistory(complaintId);

    res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetches full complaint lifecycle including routing and status history
 * GET /api/complaints/:id
 */
const getComplaintLifecycleHandler = async (req, res, next) => {
  try {
    const id = req.params.complaintId || req.params.id;
    const complaint = await caseStatusService.getComplaintWithFullLifecycle(id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        error: `Complaint '${id}' not found.`
      });
    }

    res.status(200).json({
      success: true,
      data: complaint
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateStatusHandler,
  getStatusHistoryHandler,
  getComplaintLifecycleHandler
};
