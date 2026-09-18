const { pool, getDbStatus } = require('../config/db');
const { validateCoordinates } = require('./gisService');

/**
 * Lists all jurisdiction versions with metadata and jurisdiction counts.
 */
const getAllVersions = async () => {
  const query = `
    SELECT 
      jv.id,
      jv.version_code,
      jv.version_number,
      jv.effective_from,
      jv.effective_to,
      jv.status,
      jv.source,
      jv.notes,
      jv.created_at,
      jv.activated_at,
      jv.retired_at,
      COUNT(j.id)::int AS jurisdiction_count
    FROM jurisdiction_versions jv
    LEFT JOIN jurisdictions j ON j.jurisdiction_version_id = jv.id
    GROUP BY jv.id
    ORDER BY jv.created_at DESC;
  `;
  const result = await pool.query(query);
  return result.rows;
};

/**
 * Gets a specific version by UUID or version_code.
 * Optionally includes GeoJSON geometries for all its jurisdictions.
 */
const getVersionById = async (idOrCode, includeBoundaries = false) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
  const versionQuery = `
    SELECT 
      id, version_code, version_number, effective_from, effective_to,
      status, source, notes, created_at, activated_at, retired_at
    FROM jurisdiction_versions
    WHERE ${isUUID ? 'id = $1' : 'version_code = $1'};
  `;
  const vRes = await pool.query(versionQuery, [idOrCode]);
  if (vRes.rows.length === 0) {
    return null;
  }
  const version = vRes.rows[0];

  let jurisdictionsQuery = `
    SELECT 
      j.id, j.name, j.code, j.created_at,
      a.id AS authority_id, a.name AS authority_name, a.code AS authority_code
      ${includeBoundaries ? ', ST_AsGeoJSON(j.boundary)::json AS geojson' : ''}
    FROM jurisdictions j
    JOIN authorities a ON j.authority_id = a.id
    WHERE j.jurisdiction_version_id = $1
    ORDER BY j.name ASC;
  `;
  const jRes = await pool.query(jurisdictionsQuery, [version.id]);
  version.jurisdictions = jRes.rows;

  return version;
};

/**
 * Previews/resolves a coordinate against a specific version (e.g. DRAFT or historical).
 * Does not modify or use the active version.
 */
const previewCoordinateAgainstVersion = async (versionIdOrCode, latitude, longitude) => {
  const coordVal = validateCoordinates(latitude, longitude);
  if (!coordVal.valid) {
    throw new Error(coordVal.error);
  }
  const { lat, lng } = { lat: coordVal.latitude, lng: coordVal.longitude };

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionIdOrCode);
  const query = `
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
    WHERE ${isUUID ? 'jv.id = $3' : 'jv.version_code = $3'}
      AND ST_Covers(j.boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))
    LIMIT 1;
  `;

  const result = await pool.query(query, [lng, lat, versionIdOrCode]);

  if (result.rows.length === 0) {
    return {
      matched: false,
      location: { latitude: lat, longitude: lng },
      versionQueried: versionIdOrCode,
      message: 'Coordinate does not intersect any jurisdiction boundaries in this version.'
    };
  }

  const row = result.rows[0];
  return {
    matched: true,
    location: { latitude: lat, longitude: lng },
    version: {
      id: row.version_id,
      code: row.version_code,
      number: row.version_number,
      status: row.version_status
    },
    jurisdiction: {
      id: row.jurisdiction_id,
      name: row.jurisdiction_name,
      code: row.jurisdiction_code
    },
    authority: {
      id: row.authority_id,
      name: row.authority_name,
      code: row.authority_code
    },
    boundaryEdgeAmbiguity: Boolean(row.on_boundary),
    isPreview: row.version_status !== 'ACTIVE'
  };
};

/**
 * Atomically activates a DRAFT version inside a PostgreSQL transaction:
 * 1. Locks target version (asserts it exists and status is 'DRAFT')
 * 2. Retires current 'ACTIVE' version (sets effective_to = NOW(), retired_at = NOW(), status = 'RETIRED')
 * 3. Activates target version (sets effective_from = NOW(), activated_at = NOW(), status = 'ACTIVE')
 * 4. Logs audit entry in audit_version_transitions
 * 5. Commits transaction (Rollback on any failure)
 */
const activateVersion = async (versionIdOrCode, operator = 'demo_administrator') => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionIdOrCode);

    // 1. Fetch and lock target version
    const targetQuery = `
      SELECT id, version_code, status 
      FROM jurisdiction_versions 
      WHERE ${isUUID ? 'id = $1' : 'version_code = $1'}
      FOR UPDATE;
    `;
    const targetRes = await client.query(targetQuery, [versionIdOrCode]);

    if (targetRes.rows.length === 0) {
      throw new Error(`Jurisdiction version '${versionIdOrCode}' not found.`);
    }

    const targetVersion = targetRes.rows[0];

    if (targetVersion.status === 'ACTIVE') {
      throw new Error(`Version '${targetVersion.version_code}' is already ACTIVE.`);
    }

    if (targetVersion.status === 'RETIRED') {
      throw new Error(`Version '${targetVersion.version_code}' is RETIRED and cannot be directly re-activated.`);
    }

    if (targetVersion.status !== 'DRAFT') {
      throw new Error(`Only DRAFT versions can be activated. Current status is '${targetVersion.status}'.`);
    }

    // Ensure target version has at least one jurisdiction polygon
    const countCheck = await client.query(
      'SELECT COUNT(*)::int AS count FROM jurisdictions WHERE jurisdiction_version_id = $1',
      [targetVersion.id]
    );
    if (countCheck.rows[0].count === 0) {
      throw new Error(`Cannot activate version '${targetVersion.version_code}' because it has no jurisdiction boundaries configured.`);
    }

    // 2. Fetch and lock current ACTIVE version (if any)
    const activeQuery = `
      SELECT id, version_code 
      FROM jurisdiction_versions 
      WHERE status = 'ACTIVE' 
      FOR UPDATE;
    `;
    const activeRes = await client.query(activeQuery);
    let previousVersion = null;

    if (activeRes.rows.length > 0) {
      previousVersion = activeRes.rows[0];
      // Retire current active version
      await client.query(`
        UPDATE jurisdiction_versions 
        SET status = 'RETIRED',
            retired_at = CURRENT_TIMESTAMP,
            effective_to = CURRENT_TIMESTAMP
        WHERE id = $1;
      `, [previousVersion.id]);
    }

    // 3. Activate target version
    await client.query(`
      UPDATE jurisdiction_versions 
      SET status = 'ACTIVE',
          activated_at = CURRENT_TIMESTAMP,
          effective_from = CURRENT_TIMESTAMP,
          effective_to = NULL
      WHERE id = $1;
    `, [targetVersion.id]);

    // 4. Log audit transition
    await client.query(`
      INSERT INTO audit_version_transitions (
        action, previous_version_id, new_version_id,
        previous_version_code, new_version_code, operator, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7);
    `, [
      'VERSION_ACTIVATED',
      previousVersion ? previousVersion.id : null,
      targetVersion.id,
      previousVersion ? previousVersion.version_code : null,
      targetVersion.version_code,
      operator,
      JSON.stringify({
        transition: `${previousVersion ? previousVersion.version_code : 'NONE'} -> ${targetVersion.version_code}`,
        activatedAt: new Date().toISOString()
      })
    ]);

    await client.query('COMMIT');

    return {
      success: true,
      activatedVersion: {
        id: targetVersion.id,
        code: targetVersion.version_code,
        status: 'ACTIVE'
      },
      previousVersion: previousVersion ? {
        id: previousVersion.id,
        code: previousVersion.version_code,
        status: 'RETIRED'
      } : null,
      message: `Version '${targetVersion.version_code}' has been successfully activated.`
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Compares two versions side-by-side: their status, authorities, and jurisdiction lists.
 */
const compareVersions = async (fromIdOrCode, toIdOrCode) => {
  const vFrom = await getVersionById(fromIdOrCode, false);
  const vTo = await getVersionById(toIdOrCode, false);

  if (!vFrom || !vTo) {
    throw new Error('One or both specified versions could not be found for comparison.');
  }

  return {
    fromVersion: {
      id: vFrom.id,
      code: vFrom.version_code,
      status: vFrom.status,
      effectiveFrom: vFrom.effective_from,
      effectiveTo: vFrom.effective_to,
      jurisdictions: vFrom.jurisdictions.map(j => ({
        name: j.name,
        code: j.code,
        authority: j.authority_name
      }))
    },
    toVersion: {
      id: vTo.id,
      code: vTo.version_code,
      status: vTo.status,
      effectiveFrom: vTo.effective_from,
      effectiveTo: vTo.effective_to,
      jurisdictions: vTo.jurisdictions.map(j => ({
        name: j.name,
        code: j.code,
        authority: j.authority_name
      }))
    }
  };
};

/**
 * Returns GeoJSON FeatureCollection for boundaries of a version (defaults to ACTIVE).
 */
const getBoundariesGeoJSON = async (versionIdOrCode = null) => {
  let versionId = versionIdOrCode;

  if (!versionId) {
    const activeRes = await pool.query("SELECT id FROM jurisdiction_versions WHERE status = 'ACTIVE' LIMIT 1;");
    if (activeRes.rows.length === 0) {
      return { type: 'FeatureCollection', features: [] };
    }
    versionId = activeRes.rows[0].id;
  }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId);
  const query = `
    SELECT 
      j.id,
      j.name,
      j.code,
      jv.version_code,
      jv.status AS version_status,
      a.id AS authority_id,
      a.name AS authority_name,
      a.code AS authority_code,
      ST_AsGeoJSON(j.boundary)::json AS geometry
    FROM jurisdictions j
    JOIN jurisdiction_versions jv ON j.jurisdiction_version_id = jv.id
    JOIN authorities a ON j.authority_id = a.id
    WHERE ${isUUID ? 'jv.id = $1' : 'jv.version_code = $1'};
  `;
  const res = await pool.query(query, [versionId]);

  const features = res.rows.map(row => ({
    type: 'Feature',
    id: row.id,
    properties: {
      name: row.name,
      code: row.code,
      versionCode: row.version_code,
      versionStatus: row.version_status,
      authorityId: row.authority_id,
      authorityName: row.authority_name,
      authorityCode: row.authority_code
    },
    geometry: row.geometry
  }));

  return {
    type: 'FeatureCollection',
    features
  };
};

/**
 * Sets up or resets the deterministic Demo V2 scenario (MYS_2026_V2) in DRAFT status.
 * Coordinates:
 * - In V1: Central Zone 1 (MCC) covered lat 12.2800 to 12.3200, lng 76.6200 to 76.6600.
 * - In V2:
 *   1. Revised MCC Central Zone 1: lat 12.2800 to 12.3100, lng 76.6200 to 76.6600 (still covers Palace 12.2958, 76.6394)
 *   2. New MUDA Urban Extension Zone 1 (MUDA): lat 12.3100 to 12.3500, lng 76.6300 to 76.6700 (covers Coordinate X: 12.3150, 76.6500)
 *   3. MUDA Northwest Sector: lat 12.3250 to 12.3650, lng 76.5800 to 76.6150
 */
const setupDemoV2Scenario = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if V2 exists, delete existing V2 if in DRAFT so it can be cleanly re-prepared
    const existingV2 = await client.query("SELECT id, status FROM jurisdiction_versions WHERE version_code = 'MYS_2026_V2'");
    if (existingV2.rows.length > 0) {
      if (existingV2.rows[0].status === 'ACTIVE') {
        // If already active, return as already setup and active
        await client.query('COMMIT');
        return {
          versionCode: 'MYS_2026_V2',
          status: 'ACTIVE',
          message: 'MYS_2026_V2 is already active.'
        };
      }
      // If DRAFT or RETIRED, remove to re-create clean DRAFT
      await client.query("DELETE FROM jurisdictions WHERE jurisdiction_version_id = $1", [existingV2.rows[0].id]);
      await client.query("DELETE FROM jurisdiction_versions WHERE id = $1", [existingV2.rows[0].id]);
    }

    // 2. Insert MYS_2026_V2 as DRAFT
    const v2Id = 'c0000000-0000-0000-0000-000000000002';
    await client.query(`
      INSERT INTO jurisdiction_versions (
        id, version_code, version_number, status, source, notes, created_at
      ) VALUES ($1, 'MYS_2026_V2', 2, 'DRAFT', 'HackMysuru Demo Delimitation Proposal', 'Demo Boundary Change Simulation: Transfer of north-central sector to MUDA jurisdiction', CURRENT_TIMESTAMP);
    `, [v2Id]);

    // 3. Insert V2 Jurisdictions
    // Polygon A: Revised MCC Central Zone 1 (MCC Demo Authority: a0000000-0000-0000-0000-000000000001)
    await client.query(`
      INSERT INTO jurisdictions (id, jurisdiction_version_id, authority_id, name, code, boundary)
      VALUES (
        'e0000000-0000-0000-0000-000000000011',
        $1,
        'a0000000-0000-0000-0000-000000000001',
        'MCC Central Zone 1 (DEMO V2)',
        'MCC_ZONE_1_V2',
        ST_Multi(ST_GeomFromText('POLYGON((76.6200 12.2800, 76.6600 12.2800, 76.6600 12.3100, 76.6200 12.3100, 76.6200 12.2800))', 4326))
      );
    `, [v2Id]);

    // Polygon B: New MUDA Urban Extension Zone 1 (MUDA Demo Authority: a0000000-0000-0000-0000-000000000002)
    // Covers Coordinate X: 12.3150, 76.6500!
    await client.query(`
      INSERT INTO jurisdictions (id, jurisdiction_version_id, authority_id, name, code, boundary)
      VALUES (
        'e0000000-0000-0000-0000-000000000012',
        $1,
        'a0000000-0000-0000-0000-000000000002',
        'MUDA Urban Extension Zone 1 (DEMO V2)',
        'MUDA_EXT_1_V2',
        ST_Multi(ST_GeomFromText('POLYGON((76.6300 12.3100, 76.6700 12.3100, 76.6700 12.3500, 76.6300 12.3500, 76.6300 12.3100))', 4326))
      );
    `, [v2Id]);

    // Polygon C: MUDA Northwest Sector (MUDA Demo Authority: a0000000-0000-0000-0000-000000000002)
    await client.query(`
      INSERT INTO jurisdictions (id, jurisdiction_version_id, authority_id, name, code, boundary)
      VALUES (
        'e0000000-0000-0000-0000-000000000013',
        $1,
        'a0000000-0000-0000-0000-000000000002',
        'MUDA Northwest Sector (DEMO V2)',
        'MUDA_SECTOR_NW_V2',
        ST_Multi(ST_GeomFromText('POLYGON((76.5800 12.3250, 76.6150 12.3250, 76.6150 12.3650, 76.5800 12.3650, 76.5800 12.3250))', 4326))
      );
    `, [v2Id]);

    await client.query('COMMIT');

    return {
      versionId: v2Id,
      versionCode: 'MYS_2026_V2',
      status: 'DRAFT',
      message: 'MYS_2026_V2 created in DRAFT status. Ready for preview and activation testing.'
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Gets audit history of version activations.
 */
const getAuditHistory = async () => {
  const query = `
    SELECT 
      id, action, previous_version_code, new_version_code,
      operator, details, created_at
    FROM audit_version_transitions
    ORDER BY created_at DESC
    LIMIT 20;
  `;
  const res = await pool.query(query);
  return res.rows;
};

module.exports = {
  getAllVersions,
  getVersionById,
  previewCoordinateAgainstVersion,
  activateVersion,
  compareVersions,
  getBoundariesGeoJSON,
  setupDemoV2Scenario,
  getAuditHistory
};
