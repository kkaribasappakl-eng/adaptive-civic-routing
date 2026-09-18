const {
  getSlaRules,
  getComplaintSlaDetails,
  evaluateComplaintSla,
  getSlaOverview
} = require('../services/slaService');

/**
 * GET /api/complaints/:complaintId/sla
 * Returns complete SLA details, policy benchmark, and event history
 */
const getComplaintSlaHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const slaDetails = await getComplaintSlaDetails(complaintId);

    if (!slaDetails) {
      return res.status(404).json({
        success: false,
        error: `Complaint with ID '${complaintId}' not found.`
      });
    }

    return res.status(200).json({
      success: true,
      data: slaDetails
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/complaints/:complaintId/sla/evaluate
 * Evaluates SLA status against real PostgreSQL timestamps, transitions status if needed,
 * logs append-only event, and emits Socket.IO event.
 */
const evaluateComplaintSlaHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { referenceTime } = req.body || {};

    const evaluation = await evaluateComplaintSla(complaintId, { referenceTime });

    return res.status(200).json({
      success: true,
      data: evaluation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/sla/rules
 * Returns all configured SLA benchmark rules
 */
const getSlaRulesHandler = async (req, res, next) => {
  try {
    const rules = await getSlaRules();
    return res.status(200).json({
      success: true,
      data: rules,
      total: rules.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/sla/overview
 * Returns aggregate municipal SLA metrics and compliance rate
 */
const getSlaOverviewHandler = async (req, res, next) => {
  try {
    const overview = await getSlaOverview();
    return res.status(200).json({
      success: true,
      data: overview
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getComplaintSlaHandler,
  evaluateComplaintSlaHandler,
  getSlaRulesHandler,
  getSlaOverviewHandler
};
