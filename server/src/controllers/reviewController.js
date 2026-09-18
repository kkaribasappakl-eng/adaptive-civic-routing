const {
  listReviewCases,
  getReviewCase,
  startReview,
  resolveReview,
  markUnroutable,
  getReviewActions
} = require('../services/reviewService');

/**
 * GET /api/reviews
 * Lists review cases with filters, pagination, and real counts per status.
 */
const listReviewsHandler = async (req, res, next) => {
  try {
    const { status, limit, offset, search } = req.query;
    const result = await listReviewCases({ status, limit, offset, search });
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/:reviewId
 * Fetches full review case dossier including complaint, routing state, SLA, lifecycle, and notifications.
 */
const getReviewDetailHandler = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const result = await getReviewCase(reviewId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: `Review case '${reviewId}' not found.`
      });
    }

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/reviews/:reviewId/start
 * Starts review on case (OPEN -> IN_REVIEW), assigning reviewer.
 */
const startReviewHandler = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { reviewerName, note } = req.body || {};

    if (!reviewerName || !reviewerName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'reviewerName is required to start review.'
      });
    }

    const result = await startReview(reviewId, reviewerName, note);
    return res.status(200).json({
      success: true,
      message: 'Review investigation started successfully.',
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
 * POST /api/reviews/:reviewId/resolve
 * Resolves a review case with action (ROUTE_TO_AUTHORITY, RETURN_TO_TRIAGE, CLOSE_REVIEW).
 */
const resolveReviewHandler = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { actionType, authorityId, departmentId, reviewerName, note } = req.body || {};

    if (!reviewerName || !reviewerName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'reviewerName is required to resolve a review.'
      });
    }

    if (!actionType || !actionType.trim()) {
      return res.status(400).json({
        success: false,
        error: 'actionType is required (ROUTE_TO_AUTHORITY, RETURN_TO_TRIAGE, CLOSE_REVIEW).'
      });
    }

    const result = await resolveReview(reviewId, {
      actionType,
      authorityId,
      departmentId,
      reviewerName,
      note
    });

    return res.status(200).json({
      success: true,
      message: `Review resolved via ${actionType}.`,
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
 * POST /api/reviews/:reviewId/unroutable
 * Marks review case as unroutable.
 */
const markUnroutableHandler = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { reviewerName, reason } = req.body || {};

    if (!reviewerName || !reviewerName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'reviewerName is required to mark a case unroutable.'
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        error: 'A detailed reason is required to mark a case unroutable.'
      });
    }

    const result = await markUnroutable(reviewId, reviewerName, reason);
    return res.status(200).json({
      success: true,
      message: 'Complaint successfully marked as UNROUTABLE.',
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
 * GET /api/reviews/:reviewId/actions
 * Returns append-only review action audit history.
 */
const getReviewActionsHandler = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const actions = await getReviewActions(reviewId);
    return res.status(200).json({
      success: true,
      data: actions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/meta/authorities
 * Returns active authorities and their departments for dropdown selection
 */
const getAuthoritiesHandler = async (req, res, next) => {
  try {
    const { getAuthoritiesWithDepartments } = require('../services/reviewService');
    const authorities = await getAuthoritiesWithDepartments();
    return res.status(200).json({
      success: true,
      data: authorities
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listReviewsHandler,
  getReviewDetailHandler,
  startReviewHandler,
  resolveReviewHandler,
  markUnroutableHandler,
  getReviewActionsHandler,
  getAuthoritiesHandler
};
