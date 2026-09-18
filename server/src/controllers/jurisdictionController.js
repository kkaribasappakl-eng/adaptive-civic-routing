const versionService = require('../services/versionService');

const listVersions = async (req, res, next) => {
  try {
    const versions = await versionService.getAllVersions();
    res.status(200).json({
      success: true,
      data: versions
    });
  } catch (error) {
    next(error);
  }
};

const getVersion = async (req, res, next) => {
  try {
    const { versionId } = req.params;
    const includeBoundaries = req.query.boundaries === 'true';
    const version = await versionService.getVersionById(versionId, includeBoundaries);

    if (!version) {
      return res.status(404).json({
        success: false,
        error: `Jurisdiction version '${versionId}' not found.`
      });
    }

    res.status(200).json({
      success: true,
      data: version
    });
  } catch (error) {
    next(error);
  }
};

const createVersion = async (req, res, next) => {
  try {
    const { versionCode, notes, source, createdBy, jurisdictions } = req.body;
    if (!versionCode) {
      return res.status(400).json({
        success: false,
        error: 'Field "versionCode" is required to create a new draft version.'
      });
    }

    const result = await versionService.createDraftVersion({
      versionCode,
      notes,
      source,
      createdBy,
      jurisdictions
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

const validateVersion = async (req, res, next) => {
  try {
    const { versionId } = req.params;
    const report = await versionService.validateVersion(versionId);
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

const previewVersion = async (req, res, next) => {
  try {
    const { versionId } = req.params;
    const lat = req.query.lat !== undefined ? req.query.lat : req.body.lat;
    const lng = req.query.lng !== undefined ? req.query.lng : req.body.lng;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Both "lat" and "lng" parameters are required for boundary preview.'
      });
    }

    const previewResult = await versionService.previewCoordinateAgainstVersion(versionId, lat, lng);
    res.status(200).json({
      success: true,
      ...previewResult
    });
  } catch (error) {
    next(error);
  }
};

const activateVersion = async (req, res, next) => {
  try {
    const { versionId } = req.params;
    const operator = req.body.operator || req.body.activated_by || 'Civic Administrator';
    const reason = req.body.reason || req.body.activation_reason || 'Administrative boundary activation';

    const result = await versionService.activateVersion(versionId, operator, reason);
    res.status(200).json(result);
  } catch (error) {
    // Return 400 with clear validation/transition error message
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

const compareVersions = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'Both "from" and "to" query parameters (version IDs or codes) are required.'
      });
    }

    const diff = await versionService.compareVersions(from, to);
    res.status(200).json({
      success: true,
      data: diff
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

const getBoundaries = async (req, res, next) => {
  try {
    const { version } = req.query;
    const geojson = await versionService.getBoundariesGeoJSON(version || null);
    res.status(200).json(geojson);
  } catch (error) {
    next(error);
  }
};

const setupDemoV2 = async (req, res, next) => {
  try {
    const result = await versionService.setupDemoV2Scenario();
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getAuditHistory = async (req, res, next) => {
  try {
    const audit = await versionService.getAuditHistory();
    res.status(200).json({
      success: true,
      data: audit
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
