const express = require('express');
const router = express.Router();
const {
  listReviewsHandler,
  getReviewDetailHandler,
  startReviewHandler,
  resolveReviewHandler,
  markUnroutableHandler,
  getReviewActionsHandler,
  getAuthoritiesHandler
} = require('../controllers/reviewController');

/**
 * @route   GET /api/reviews
 * @desc    List review queue cases with filters and status counts
 */
router.get('/', listReviewsHandler);

/**
 * @route   GET /api/reviews/meta/authorities
 * @desc    Get real authorities and departments for human routing assignment
 */
router.get('/meta/authorities', getAuthoritiesHandler);

/**
 * @route   GET /api/reviews/:reviewId
 * @desc    Get complete review case dossier
 */
router.get('/:reviewId', getReviewDetailHandler);

/**
 * @route   POST /api/reviews/:reviewId/start
 * @desc    Start review (OPEN -> IN_REVIEW) with reviewer assignment
 */
router.post('/:reviewId/start', startReviewHandler);

/**
 * @route   POST /api/reviews/:reviewId/resolve
 * @desc    Resolve review (ROUTE_TO_AUTHORITY, RETURN_TO_TRIAGE, CLOSE_REVIEW)
 */
router.post('/:reviewId/resolve', resolveReviewHandler);

/**
 * @route   POST /api/reviews/:reviewId/unroutable
 * @desc    Mark case as unroutable
 */
router.post('/:reviewId/unroutable', markUnroutableHandler);

/**
 * @route   GET /api/reviews/:reviewId/actions
 * @desc    Get append-only audit trail of actions for a review case
 */
router.get('/:reviewId/actions', getReviewActionsHandler);

module.exports = router;
