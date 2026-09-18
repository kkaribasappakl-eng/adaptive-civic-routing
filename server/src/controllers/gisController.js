const { validateCoordinates, getActiveJurisdictionForPoint } = require('../services/gisService');

/**
 * GIS Test Controller
 * GET /api/gis/test?lat=...&lng=...
 */
const testPointInPolygon = async (req, res, next) => {
  try {
    const { lat, lng } = req.query;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Both "lat" and "lng" query parameters are required. Example: /api/gis/test?lat=12.2958&lng=76.6394'
      });
    }

    const validation = validateCoordinates(lat, lng);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        input: { lat, lng }
      });
    }

    const gisResult = await getActiveJurisdictionForPoint(validation.latitude, validation.longitude);

    if (!gisResult.databaseAvailable) {
      return res.status(503).json({
        success: false,
        databaseConnected: false,
        message: gisResult.message,
        location: gisResult.location,
        guidance: 'PostgreSQL/PostGIS is offline. Please start the PostgreSQL service or container to test real spatial queries.'
      });
    }

    if (!gisResult.matched) {
      return res.status(200).json({
        success: true,
        matched: false,
        location: gisResult.location,
        message: 'No active jurisdiction covers the provided coordinates.',
        guidance: 'Point is outside demo jurisdiction boundaries (e.g. outside Central Mysuru / MUDA sectors).'
      });
    }

    return res.status(200).json({
      success: true,
      matched: true,
      location: gisResult.location,
      jurisdiction: gisResult.jurisdiction,
      authority: gisResult.authority,
      routingFlag: gisResult.routingFlag,
      boundaryEdgeAmbiguity: gisResult.boundaryEdgeAmbiguity
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  testPointInPolygon
};
