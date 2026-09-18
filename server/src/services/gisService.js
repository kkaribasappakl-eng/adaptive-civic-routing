const { pool, getDbStatus } = require('../config/db');

/**
 * Validates whether latitude and longitude are valid numeric geographic coordinates.
 * Convention: Latitude [-90, 90], Longitude [-180, 180]
 */
const validateCoordinates = (latitude, longitude) => {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng)) {
    return {
      valid: false,
      error: 'Coordinates must be valid numbers',
      latitude: lat,
      longitude: lng
    };
  }

  if (lat < -90 || lat > 90) {
    return {
      valid: false,
      error: 'Latitude must be between -90 and 90 degrees',
      latitude: lat,
      longitude: lng
    };
  }

  if (lng < -180 || lng > 180) {
    return {
      valid: false,
      error: 'Longitude must be between -180 and 180 degrees',
      latitude: lat,
      longitude: lng
    };
  }

  return {
    valid: true,
    latitude: lat,
    longitude: lng
  };
};

/**
 * Core spatial query to find jurisdiction covering a coordinate.
 * Uses PostGIS ST_Covers and ST_Touches on geometry(MultiPolygon, 4326).
 * 
 * CRITICAL GIS CONVENTION:
 * ST_MakePoint(X, Y) -> ST_MakePoint(longitude, latitude)
 */
const findJurisdictionByPoint = async (latitude, longitude, versionCode = null) => {
  const coordValidation = validateCoordinates(latitude, longitude);
  if (!coordValidation.valid) {
    throw new Error(coordValidation.error);
  }

  const { lat, lng } = { lat: coordValidation.latitude, lng: coordValidation.longitude };

  const dbStatus = getDbStatus();
  if (!pool || !dbStatus.connected) {
    return {
      databaseAvailable: false,
      matched: false,
      message: 'PostgreSQL/PostGIS database is currently offline. Spatial query cannot be executed.',
      location: { latitude: lat, longitude: lng }
    };
  }

  let query;
  let params;

  if (versionCode) {
    query = `
      SELECT 
        j.id AS jurisdiction_id,
        j.name AS jurisdiction_name,
        j.code AS jurisdiction_code,
        jv.id AS version_id,
        jv.version_code,
        jv.version_number,
        jv.status AS version_status,
        a.id AS authority_id,
        a.name AS authority_name,
        a.code AS authority_code,
        ST_Touches(j.boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326)) AS on_boundary
      FROM jurisdictions j
      JOIN jurisdiction_versions jv ON j.jurisdiction_version_id = jv.id
      JOIN authorities a ON j.authority_id = a.id
      WHERE jv.version_code = $3
        AND ST_Covers(j.boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      ORDER BY j.created_at ASC
      LIMIT 1;
    `;
    params = [lng, lat, versionCode];
  } else {
    query = `
      SELECT 
        j.id AS jurisdiction_id,
        j.name AS jurisdiction_name,
        j.code AS jurisdiction_code,
        jv.id AS version_id,
        jv.version_code,
        jv.version_number,
        jv.status AS version_status,
        a.id AS authority_id,
        a.name AS authority_name,
        a.code AS authority_code,
        ST_Touches(j.boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326)) AS on_boundary
      FROM jurisdictions j
      JOIN jurisdiction_versions jv ON j.jurisdiction_version_id = jv.id
      JOIN authorities a ON j.authority_id = a.id
      WHERE jv.status = 'ACTIVE'
        AND ST_Covers(j.boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      ORDER BY j.created_at ASC
      LIMIT 1;
    `;
    params = [lng, lat];
  }

  try {
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return {
        databaseAvailable: true,
        matched: false,
        location: { latitude: lat, longitude: lng },
        message: 'Coordinate is outside all configured demo jurisdictions in this version.'
      };
    }

    const row = result.rows[0];
    const boundaryEdgeAmbiguity = Boolean(row.on_boundary);

    return {
      databaseAvailable: true,
      matched: true,
      location: { latitude: lat, longitude: lng },
      jurisdiction: {
        id: row.jurisdiction_id,
        name: row.jurisdiction_name,
        code: row.jurisdiction_code,
        version: row.version_code
      },
      authority: {
        id: row.authority_id,
        name: row.authority_name,
        code: row.authority_code
      },
      routingFlag: boundaryEdgeAmbiguity ? 'HUMAN_REVIEW_EDGE_CASE' : 'AUTOMATIC_DISPATCH',
      boundaryEdgeAmbiguity
    };
  } catch (err) {
    console.error('[GIS Service Error]', err.message);
    throw new Error(`Spatial query failure: ${err.message}`);
  }
};

/**
 * Convenience wrapper for the active jurisdiction version
 */
const getActiveJurisdictionForPoint = async (latitude, longitude) => {
  return findJurisdictionByPoint(latitude, longitude, null);
};

module.exports = {
  validateCoordinates,
  findJurisdictionByPoint,
  getActiveJurisdictionForPoint
};
