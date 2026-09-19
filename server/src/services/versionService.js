const { pool, getDbStatus } = require('../config/db');
const { validateCoordinates } = require('./gisService');
const { getIO } = require('./socketService');

/**
 * Lists all jurisdiction versions with metadata, validation info, and jurisdiction counts.
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
      jv.created_by,
      jv.validated_at,
      jv.validation_status,
      jv.validation_message,
      jv.validation_details,
      jv.activated_by,
      jv.activation_reason,
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
      status, source, notes, created_at, activated_at, retired_at,
      created_by, validated_at, validation_status, validation_message,
      validation_details, activated_by, activation_reason
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
 * Creates a new DRAFT jurisdiction version safely without affecting live routing.
 */
const createDraftVersion = async ({ versionCode, notes, source, createdBy = 'civic_admin', jurisdictions = [] }) => {
  if (!versionCode || typeof versionCode !== 'string' || versionCode.trim() === '') {
    throw new Error('versionCode is required to create a jurisdiction version.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if version_code already exists
    const existing = await client.query(
      'SELECT id FROM jurisdiction_versions WHERE version_code = $1',
      [versionCode.trim()]
    );
    if (existing.rows.length > 0) {
      throw new Error(`Jurisdiction version '${versionCode.trim()}' already exists.`);
    }

    // 2. Determine next version number
    const numRes = await client.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_num FROM jurisdiction_versions'
    );
    const versionNumber = parseInt(numRes.rows[0].next_num, 10);

    // 3. Insert new DRAFT version record
    const insertVersionQuery = `
      INSERT INTO jurisdiction_versions (
        version_code, version_number, status, source, notes,
        created_by, validation_status, validation_message, created_at
      ) VALUES ($1, $2, 'DRAFT', $3, $4, $5, 'PENDING', 'New draft awaiting PostGIS boundary validation', CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const vRes = await client.query(insertVersionQuery, [
      versionCode.trim(),
      versionNumber,
      source || 'Administrative Boundary Delimitation Proposal',
      notes || 'Civic administration boundary draft',
      createdBy
    ]);
    const newVersion = vRes.rows[0];

    // 4. Insert any supplied jurisdictions
    if (Array.isArray(jurisdictions) && jurisdictions.length > 0) {
      for (const j of jurisdictions) {
        if (!j.authority_id || !j.name || !j.code || !j.boundaryWkt) {
          throw new Error('Each jurisdiction must provide authority_id, name, code, and boundaryWkt (WKT geometry).');
        }

        // Verify authority exists and is active
        const authCheck = await client.query(
          'SELECT id, is_active FROM authorities WHERE id = $1',
          [j.authority_id]
        );
        if (authCheck.rows.length === 0 || !authCheck.rows[0].is_active) {
          throw new Error(`Authority '${j.authority_id}' does not exist or is inactive.`);
        }

        const insertJQuery = `
          INSERT INTO jurisdictions (
            jurisdiction_version_id, authority_id, name, code, boundary, created_at
          ) VALUES (
            $1, $2, $3, $4,
            ST_Multi(ST_GeomFromText($5, 4326)),
            CURRENT_TIMESTAMP
          );
        `;
        await client.query(insertJQuery, [
          newVersion.id,
          j.authority_id,
          j.name,
          j.code,
          j.boundaryWkt
        ]);
      }
    }

    // 5. Insert transition audit log
    await client.query(`
      INSERT INTO audit_version_transitions (
        action, new_version_id, new_version_code, operator, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP);
    `, [
      'VERSION_CREATED',
      newVersion.id,
      newVersion.version_code,
      createdBy,
      JSON.stringify({
        notes: newVersion.notes,
        jurisdictionCount: jurisdictions.length,
        status: 'DRAFT'
      })
    ]);

    // Stage 13: Centralized Transaction-coupled Audit Logging
    const { logAuditEvent } = require('./auditService');
    await logAuditEvent({
      actorUserId: null,
      actorRole: 'ADMIN',
      action: 'JURISDICTION_DRAFT_CREATED',
      entityType: 'JURISDICTION',
      entityId: newVersion.id,
      result: 'SUCCESS',
      reason: newVersion.notes || 'Created draft version',
      metadata: {
        versionCode: newVersion.version_code,
        jurisdictionCount: jurisdictions.length,
        status: 'DRAFT',
        createdBy
      },
      client // Transaction coupled!
    });

    await client.query('COMMIT');

    // Automatically validate the newly created version
    const validation = await validateVersion(newVersion.id);

    return {
      success: true,
      version: {
        ...newVersion,
        validation
      },
      message: `Draft version '${newVersion.version_code}' created successfully in DRAFT status.`
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Performs authoritative PostGIS boundary validation on a jurisdiction version:
 * 1. Geometry exists and is not null
 * 2. ST_IsValid and ST_IsValidReason
 * 3. NOT ST_IsEmpty
 * 4. Geometry type is Polygon or MultiPolygon
 * 5. SRID is 4326
 * 6. Authority relationship exists and is active
 * 7. Overlap check (> 1 sq meter area overlap between jurisdictions in same version)
 * 8. Coverage and gap comparison against current active version
 * Persists validation result to database.
 */
const validateVersion = async (versionIdOrCode, dbClient = pool) => {
  const clientProvided = dbClient !== pool;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionIdOrCode);

  // 1. Fetch version record
  const vRes = await dbClient.query(`
    SELECT id, version_code, version_number, status, validation_status
    FROM jurisdiction_versions
    WHERE ${isUUID ? 'id = $1' : 'version_code = $1'};
  `, [versionIdOrCode]);

  if (vRes.rows.length === 0) {
    throw new Error(`Jurisdiction version '${versionIdOrCode}' not found.`);
  }
  const version = vRes.rows[0];

  // 2. Fetch jurisdictions with real PostGIS spatial properties
  const jRes = await dbClient.query(`
    SELECT 
      j.id, j.name, j.code, j.authority_id,
      a.name AS authority_name, a.code AS authority_code, a.is_active AS authority_is_active,
      (j.boundary IS NOT NULL) AS has_geometry,
      ST_IsEmpty(j.boundary) AS is_empty,
      ST_IsValid(j.boundary) AS is_valid,
      ST_IsValidReason(j.boundary) AS invalid_reason,
      ST_GeometryType(j.boundary) AS geom_type,
      ST_SRID(j.boundary) AS srid,
      ST_Area(j.boundary::geography) AS area_sqm
    FROM jurisdictions j
    LEFT JOIN authorities a ON j.authority_id = a.id
    WHERE j.jurisdiction_version_id = $1
    ORDER BY j.name ASC;
  `, [version.id]);

  const jurisdictions = jRes.rows;
  const issues = [];
  const details = {
    checkedAt: new Date().toISOString(),
    jurisdictionCount: jurisdictions.length,
    geometryChecks: [],
    overlapCheck: {
      hasOverlap: false,
      overlappingPairs: [],
      thresholdSqm: 1.0,
      details: 'No area overlap detected between boundaries.'
    },
    coverageCheck: {
      totalAreaSqKm: 0,
      activeAreaSqKm: 0,
      netChangeSqKm: 0,
      addedAreaSqKm: 0,
      removedAreaSqKm: 0,
      syntheticDemoNotice: 'DEMO / SYNTHETIC CIVIC BOUNDARIES — Not official municipal survey boundaries.'
    }
  };

  // Check 1: Must have at least one jurisdiction boundary
  if (jurisdictions.length === 0) {
    issues.push('Version has no jurisdiction boundaries configured.');
  }

  // Check 2: Individual geometry validation per jurisdiction
  for (const j of jurisdictions) {
    const jCheck = {
      id: j.id,
      name: j.name,
      code: j.code,
      authority: j.authority_name,
      hasGeometry: Boolean(j.has_geometry),
      isEmpty: Boolean(j.is_empty),
      isValid: Boolean(j.is_valid),
      invalidReason: j.invalid_reason,
      geometryType: j.geom_type,
      srid: parseInt(j.srid, 10),
      areaSqKm: Number((parseFloat(j.area_sqm || 0) / 1000000).toFixed(4)),
      authorityActive: Boolean(j.authority_is_active),
      passed: true,
      failureReasons: []
    };

    if (!j.has_geometry) {
      jCheck.passed = false;
      jCheck.failureReasons.push('Geometry is NULL.');
      issues.push(`Jurisdiction '${j.name}': Geometry is missing.`);
    }
    if (j.is_empty) {
      jCheck.passed = false;
      jCheck.failureReasons.push('Geometry is empty.');
      issues.push(`Jurisdiction '${j.name}': Geometry is empty.`);
    }
    if (!j.is_valid) {
      jCheck.passed = false;
      jCheck.failureReasons.push(`PostGIS invalid: ${j.invalid_reason}`);
      issues.push(`Jurisdiction '${j.name}': PostGIS geometry is invalid (${j.invalid_reason}).`);
    }
    if (!['ST_Polygon', 'ST_MultiPolygon'].includes(j.geom_type)) {
      jCheck.passed = false;
      jCheck.failureReasons.push(`Invalid geometry type '${j.geom_type}'. Must be Polygon or MultiPolygon.`);
      issues.push(`Jurisdiction '${j.name}': Geometry type '${j.geom_type}' is not supported.`);
    }
    if (parseInt(j.srid, 10) !== 4326) {
      jCheck.passed = false;
      jCheck.failureReasons.push(`Invalid SRID ${j.srid}. Must be EPSG:4326 (WGS 84).`);
      issues.push(`Jurisdiction '${j.name}': Invalid SRID (${j.srid}). Expected 4326.`);
    }
    if (!j.authority_is_active) {
      jCheck.passed = false;
      jCheck.failureReasons.push('Associated authority is inactive or missing.');
      issues.push(`Jurisdiction '${j.name}': Authority is inactive.`);
    }

    details.geometryChecks.push(jCheck);
  }

  // Check 3: Real PostGIS Overlap Detection between jurisdictions in this version
  // Distinguish shared boundary edges (ST_Touches) from actual area overlaps (> 1 sq meter)
  if (jurisdictions.length > 1) {
    const overlapQuery = `
      SELECT 
        j1.id AS id1, j1.name AS name1, j1.code AS code1,
        j2.id AS id2, j2.name AS name2, j2.code AS code2,
        ST_Area(ST_Intersection(j1.boundary, j2.boundary)::geography) AS overlap_area_sqm,
        ST_Touches(j1.boundary, j2.boundary) AS touches_edge
      FROM jurisdictions j1
      JOIN jurisdictions j2 ON j1.jurisdiction_version_id = j2.jurisdiction_version_id AND j1.id < j2.id
      WHERE j1.jurisdiction_version_id = $1
        AND ST_Intersects(j1.boundary, j2.boundary)
        AND ST_Area(ST_Intersection(j1.boundary, j2.boundary)::geography) > 1.0;
    `;
    const overlapRes = await dbClient.query(overlapQuery, [version.id]);

    if (overlapRes.rows.length > 0) {
      details.overlapCheck.hasOverlap = true;
      details.overlapCheck.overlappingPairs = overlapRes.rows.map(r => ({
        jurisdictionA: { id: r.id1, name: r.name1, code: r.code1 },
        jurisdictionB: { id: r.id2, name: r.name2, code: r.code2 },
        overlapAreaSqm: parseFloat(r.overlap_area_sqm).toFixed(2),
        overlapAreaSqKm: (parseFloat(r.overlap_area_sqm) / 1000000).toFixed(6),
        touchesEdge: Boolean(r.touches_edge)
      }));
      details.overlapCheck.details = `Detected ${overlapRes.rows.length} overlapping jurisdiction pair(s) with actual area collision exceeding 1.0 m².`;
      issues.push(`Boundary Overlap Detected: ${details.overlapCheck.details}`);
    }
  }

  // Check 4: Coverage and Gap Analysis against current ACTIVE version
  try {
    const activeRes = await dbClient.query(
      "SELECT id, version_code FROM jurisdiction_versions WHERE status = 'ACTIVE' LIMIT 1"
    );

    // Total area of proposed version
    const proposedAreaRes = await dbClient.query(`
      SELECT COALESCE(ST_Area(ST_Union(boundary)::geography), 0) AS area_sqm
      FROM jurisdictions
      WHERE jurisdiction_version_id = $1;
    `, [version.id]);
    const proposedAreaSqm = parseFloat(proposedAreaRes.rows[0]?.area_sqm || 0);
    details.coverageCheck.totalAreaSqKm = Number((proposedAreaSqm / 1000000).toFixed(4));

    if (activeRes.rows.length > 0) {
      const activeVersion = activeRes.rows[0];
      details.coverageCheck.activeVersionCode = activeVersion.version_code;

      const activeAreaRes = await dbClient.query(`
        SELECT COALESCE(ST_Area(ST_Union(boundary)::geography), 0) AS area_sqm
        FROM jurisdictions
        WHERE jurisdiction_version_id = $1;
      `, [activeVersion.id]);
      const activeAreaSqm = parseFloat(activeAreaRes.rows[0]?.area_sqm || 0);
      details.coverageCheck.activeAreaSqKm = Number((activeAreaSqm / 1000000).toFixed(4));
      details.coverageCheck.netChangeSqKm = Number(((proposedAreaSqm - activeAreaSqm) / 1000000).toFixed(4));

      // Territory differences (added / removed)
      if (proposedAreaSqm > 0 && activeAreaSqm > 0 && version.id !== activeVersion.id) {
        const diffRes = await dbClient.query(`
          SELECT 
            COALESCE(ST_Area(ST_Difference(p.geom, a.geom)::geography), 0) AS added_sqm,
            COALESCE(ST_Area(ST_Difference(a.geom, p.geom)::geography), 0) AS removed_sqm
          FROM 
            (SELECT ST_Union(boundary) AS geom FROM jurisdictions WHERE jurisdiction_version_id = $1) p,
            (SELECT ST_Union(boundary) AS geom FROM jurisdictions WHERE jurisdiction_version_id = $2) a
          WHERE p.geom IS NOT NULL AND a.geom IS NOT NULL;
        `, [version.id, activeVersion.id]);

        if (diffRes.rows.length > 0) {
          const addedSqm = parseFloat(diffRes.rows[0].added_sqm || 0);
          const removedSqm = parseFloat(diffRes.rows[0].removed_sqm || 0);
          details.coverageCheck.addedAreaSqKm = Number((addedSqm / 1000000).toFixed(4));
          details.coverageCheck.removedAreaSqKm = Number((removedSqm / 1000000).toFixed(4));
        }
      }
    }
  } catch (covErr) {
    console.warn('[VersionService] Coverage calculation note:', covErr.message);
  }

  // 5. Final Validation Verdict
  const isValid = issues.length === 0;
  const validationStatus = isValid ? 'VALID' : 'INVALID';
  const validationMessage = isValid
    ? 'All PostGIS boundaries valid, non-overlapping, and topologically sound.'
    : `Validation failed: ${issues.join(' | ')}`;

  // 6. Authoritative Persistence into PostgreSQL
  await dbClient.query(`
    UPDATE jurisdiction_versions 
    SET validation_status = $1,
        validated_at = CURRENT_TIMESTAMP,
        validation_message = $2,
        validation_details = $3
    WHERE id = $4;
  `, [validationStatus, validationMessage, JSON.stringify(details), version.id]);

  // Stage 13: Audit logging for boundary validation
  try {
    const { logAuditEvent } = require('./auditService');
    await logAuditEvent({
      actorUserId: null,
      actorRole: 'ADMIN',
      action: 'JURISDICTION_VALIDATED',
      entityType: 'JURISDICTION',
      entityId: version.id,
      result: isValid ? 'SUCCESS' : 'FAILURE',
      reason: validationMessage,
      metadata: {
        versionCode: version.version_code,
        validationStatus,
        issuesCount: issues.length
      },
      client: clientProvided ? dbClient : null
    });
  } catch (auditErr) {
    if (clientProvided) throw auditErr;
    console.warn('[Audit Warning] Jurisdiction validation audit failed:', auditErr.message);
  }

  return {
    versionId: version.id,
    versionCode: version.version_code,
    valid: isValid,
    validationStatus,
    validationMessage,
    issues,
    details
  };
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
      jv.validation_status,
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
      isPreview: true,
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
      status: row.version_status,
      validationStatus: row.validation_status
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
    isPreview: row.version_status !== 'ACTIVE',
    syntheticNotice: 'DEMO / SYNTHETIC CIVIC BOUNDARIES'
  };
};

/**
 * Atomically activates a DRAFT version inside a PostgreSQL transaction:
 * 1. Locks target version (asserts it exists and status is 'DRAFT')
 * 2. Runs and verifies PostGIS boundary validation
 * 3. Locks current 'ACTIVE' version (if any)
 * 4. Retires current 'ACTIVE' version (status = 'RETIRED', retired_at = NOW(), effective_to = NOW())
 * 5. Activates target version (status = 'ACTIVE', effective_from = NOW(), activated_at = NOW(), activated_by, activation_reason)
 * 6. Logs audit entry in audit_version_transitions
 * 7. Commits transaction (Rollback on any failure)
 * 8. Emits Socket.IO 'jurisdiction:version_activated' event post-commit
 */
const activateVersion = async (versionIdOrCode, operator = 'Civic Administrator', reason = 'Scheduled boundary activation') => {
  const client = await pool.connect();
  let activatedVersionData = null;
  let previousVersionData = null;

  try {
    await client.query('BEGIN');

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionIdOrCode);

    // 1. Fetch and lock target version
    const targetQuery = `
      SELECT id, version_code, version_number, status, validation_status 
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

    // 2. Authoritative PostGIS validation check inside activation transaction
    // If not already valid, run validation. If validation fails, abort activation!
    const validationCheck = await validateVersion(targetVersion.id, client);
    if (!validationCheck.valid) {
      throw new Error(`Cannot activate version '${targetVersion.version_code}': Boundary validation failed (${validationCheck.validationMessage}).`);
    }

    // 3. Fetch and lock current ACTIVE version (if any)
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

    // 4. Activate target version
    await client.query(`
      UPDATE jurisdiction_versions 
      SET status = 'ACTIVE',
          activated_at = CURRENT_TIMESTAMP,
          effective_from = CURRENT_TIMESTAMP,
          effective_to = NULL,
          activated_by = $1,
          activation_reason = $2
      WHERE id = $3;
    `, [operator, reason, targetVersion.id]);

    // 5. Log audit transition
    await client.query(`
      INSERT INTO audit_version_transitions (
        action, previous_version_id, new_version_id,
        previous_version_code, new_version_code, operator, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP);
    `, [
      'VERSION_ACTIVATED',
      previousVersion ? previousVersion.id : null,
      targetVersion.id,
      previousVersion ? previousVersion.version_code : null,
      targetVersion.version_code,
      operator,
      JSON.stringify({
        transition: `${previousVersion ? previousVersion.version_code : 'NONE'} -> ${targetVersion.version_code}`,
        reason,
        activatedAt: new Date().toISOString()
      })
    ]);

    // Stage 13: Centralized Transaction-coupled Audit Logging
    const { logAuditEvent } = require('./auditService');
    await logAuditEvent({
      actorUserId: null,
      actorRole: 'ADMIN',
      action: 'JURISDICTION_ACTIVATED',
      entityType: 'JURISDICTION',
      entityId: targetVersion.id,
      result: 'SUCCESS',
      reason,
      metadata: {
        previousVersionId: previousVersion ? previousVersion.id : null,
        previousVersionCode: previousVersion ? previousVersion.version_code : null,
        targetVersionId: targetVersion.id,
        targetVersionCode: targetVersion.version_code,
        operator,
        transition: `${previousVersion ? previousVersion.version_code : 'NONE'} -> ${targetVersion.version_code}`
      },
      client // SAME TRANSACTION CLIENT!
    });

    await client.query('COMMIT');

    activatedVersionData = {
      id: targetVersion.id,
      code: targetVersion.version_code,
      status: 'ACTIVE'
    };
    previousVersionData = previousVersion ? {
      id: previousVersion.id,
      code: previousVersion.version_code,
      status: 'RETIRED'
    } : null;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // 6. Post-commit Socket.IO broadcast (ONLY emitted after successful database commit)
  try {
    const io = getIO();
    if (io) {
      io.emit('jurisdiction:version_activated', {
        versionId: activatedVersionData.id,
        versionCode: activatedVersionData.code,
        previousVersionId: previousVersionData?.id || null,
        previousVersionCode: previousVersionData?.code || null,
        activatedAt: new Date().toISOString(),
        operator,
        reason
      });
    }
  } catch (socketErr) {
    console.warn('[Socket.IO] jurisdiction:version_activated broadcast warning:', socketErr.message);
  }

  return {
    success: true,
    activatedVersion: activatedVersionData,
    previousVersion: previousVersionData,
    operator,
    reason,
    message: `Version '${activatedVersionData.code}' has been successfully activated.`
  };
};

/**
 * Compares two versions side-by-side: their status, authorities, jurisdiction lists, and PostGIS coverage metrics.
 */
const compareVersions = async (fromIdOrCode, toIdOrCode) => {
  const vFrom = await getVersionById(fromIdOrCode, false);
  const vTo = await getVersionById(toIdOrCode, false);

  if (!vFrom || !vTo) {
    throw new Error('One or both specified versions could not be found for comparison.');
  }

  // Calculate spatial areas using PostGIS
  const [areaFromRes, areaToRes] = await Promise.all([
    pool.query('SELECT COALESCE(ST_Area(ST_Union(boundary)::geography), 0) AS sqm FROM jurisdictions WHERE jurisdiction_version_id = $1', [vFrom.id]),
    pool.query('SELECT COALESCE(ST_Area(ST_Union(boundary)::geography), 0) AS sqm FROM jurisdictions WHERE jurisdiction_version_id = $1', [vTo.id])
  ]);

  const fromAreaSqKm = Number((parseFloat(areaFromRes.rows[0]?.sqm || 0) / 1000000).toFixed(4));
  const toAreaSqKm = Number((parseFloat(areaToRes.rows[0]?.sqm || 0) / 1000000).toFixed(4));
  const netChangeSqKm = Number((toAreaSqKm - fromAreaSqKm).toFixed(4));

  // Determine added, removed, and persistent jurisdictions
  const fromCodes = new Set(vFrom.jurisdictions.map(j => j.code));
  const toCodes = new Set(vTo.jurisdictions.map(j => j.code));

  const addedJurisdictions = vTo.jurisdictions.filter(j => !fromCodes.has(j.code));
  const removedJurisdictions = vFrom.jurisdictions.filter(j => !toCodes.has(j.code));
  const commonJurisdictions = vTo.jurisdictions.filter(j => fromCodes.has(j.code));

  return {
    fromVersion: {
      id: vFrom.id,
      code: vFrom.version_code,
      status: vFrom.status,
      validationStatus: vFrom.validation_status,
      effectiveFrom: vFrom.effective_from,
      effectiveTo: vFrom.effective_to,
      totalAreaSqKm: fromAreaSqKm,
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
      validationStatus: vTo.validation_status,
      effectiveFrom: vTo.effective_from,
      effectiveTo: vTo.effective_to,
      totalAreaSqKm: toAreaSqKm,
      jurisdictions: vTo.jurisdictions.map(j => ({
        name: j.name,
        code: j.code,
        authority: j.authority_name
      }))
    },
    differences: {
      fromAreaSqKm,
      toAreaSqKm,
      netChangeSqKm,
      addedJurisdictions: addedJurisdictions.map(j => ({ name: j.name, code: j.code, authority: j.authority_name })),
      removedJurisdictions: removedJurisdictions.map(j => ({ name: j.name, code: j.code, authority: j.authority_name })),
      commonCount: commonJurisdictions.length,
      syntheticNotice: 'DEMO / SYNTHETIC CIVIC BOUNDARIES'
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
      jv.validation_status,
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
      validationStatus: row.validation_status,
      authorityId: row.authority_id,
      authorityName: row.authority_name,
      authorityCode: row.authority_code,
      isDemo: true
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
 */
const setupDemoV2Scenario = async () => {
  const client = await pool.connect();
  const v2Id = 'c0000000-0000-0000-0000-000000000002';
  try {
    await client.query('BEGIN');

    // 1. Check if V2 exists; reset to DRAFT or insert if new
    const existingV2 = await client.query("SELECT id, status FROM jurisdiction_versions WHERE version_code = 'MYS_2026_V2'");
    if (existingV2.rows.length > 0) {
      await client.query(`
        UPDATE jurisdiction_versions 
        SET status = 'DRAFT', effective_from = NULL, effective_to = NULL, activated_at = NULL, retired_at = NULL,
            validation_status = 'PENDING', validation_message = NULL, validation_details = NULL
        WHERE id = $1
      `, [existingV2.rows[0].id]);
      await client.query("DELETE FROM jurisdictions WHERE jurisdiction_version_id = $1", [existingV2.rows[0].id]);
    } else {
      await client.query(`
        INSERT INTO jurisdiction_versions (
          id, version_code, version_number, status, source, notes, created_by, validation_status, created_at
        ) VALUES (
          $1, 'MYS_2026_V2', 2, 'DRAFT',
          'HackMysuru Demo Delimitation Proposal',
          'Demo Boundary Change Simulation: Transfer of north-central sector to MUDA jurisdiction',
          'civic_admin', 'PENDING', CURRENT_TIMESTAMP
        );
      `, [v2Id]);
    }

    // Guarantee that exactly one version is ACTIVE (restore MYS_2026_V1 if no version is currently active)
    const activeCheck = await client.query("SELECT id FROM jurisdiction_versions WHERE status = 'ACTIVE'");
    if (activeCheck.rows.length === 0) {
      await client.query("UPDATE jurisdiction_versions SET status = 'ACTIVE', effective_to = NULL, retired_at = NULL WHERE version_code = 'MYS_2026_V1'");
    }

    // 2. Insert V2 Jurisdictions
    // Polygon A: Revised MCC Central Zone 1
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

    // Polygon B: New MUDA Urban Extension Zone 1 (covers Coordinate X: 12.3150, 76.6500)
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

    // Polygon C: MUDA Northwest Sector
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
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // Authoritatively validate the V2 draft
  const validation = await validateVersion(v2Id);

  return {
    versionId: v2Id,
    versionCode: 'MYS_2026_V2',
    status: 'DRAFT',
    validation,
    message: 'MYS_2026_V2 created in DRAFT status and validated. Ready for preview and activation testing.'
  };
};

/**
 * Gets audit history of version activations and lifecycle changes.
 */
const getAuditHistory = async () => {
  const query = `
    SELECT 
      id, action, previous_version_code, new_version_code,
      operator, details, created_at
    FROM audit_version_transitions
    ORDER BY created_at DESC
    LIMIT 50;
  `;
  const res = await pool.query(query);
  return res.rows;
};

module.exports = {
  getAllVersions,
  getVersionById,
  createDraftVersion,
  validateVersion,
  previewCoordinateAgainstVersion,
  activateVersion,
  compareVersions,
  getBoundariesGeoJSON,
  setupDemoV2Scenario,
  getAuditHistory
};
