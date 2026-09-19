const { pool } = require('../config/db');

const CONTROLLED_CATEGORIES = [
  'GARBAGE',
  'ILLEGAL_DUMPING',
  'POTHOLE',
  'DRAINAGE',
  'STREETLIGHT',
  'C_AND_D_WASTE',
  'WATER_LEAK',
  'OTHER'
];

const CONTROLLED_STATUSES = [
  'SUBMITTED',
  'TRIAGED',
  'ROUTED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'HUMAN_REVIEW'
];

/**
 * Helper to build parameterized SQL WHERE clauses for complaint filters.
 * STRICT SECURITY: Never concatenate raw user input.
 * All filters parameterized against SQL injection.
 * Safely ignores empty or whitespace-only filter values.
 */
function buildComplaintFilters(filters = {}, prefix = 'c', startParamIndex = 1) {
  const clauses = [];
  const params = [];
  let paramIndex = startParamIndex;

  // 1. days filter (integer > 0)
  if (filters.days && Number.isInteger(Number(filters.days)) && Number(filters.days) > 0) {
    clauses.push(`${prefix}.created_at >= CURRENT_TIMESTAMP - ($${paramIndex} * INTERVAL '1 day')`);
    params.push(Number(filters.days));
    paramIndex++;
  } else if (filters.startDate && typeof filters.startDate === 'string' && filters.startDate.trim().length > 0) {
    // 2. startDate filter
    clauses.push(`${prefix}.created_at >= $${paramIndex}::timestamptz`);
    params.push(filters.startDate.trim());
    paramIndex++;
  }

  // 3. endDate filter
  if (filters.endDate && typeof filters.endDate === 'string' && filters.endDate.trim().length > 0) {
    clauses.push(`${prefix}.created_at <= $${paramIndex}::timestamptz`);
    params.push(filters.endDate.trim());
    paramIndex++;
  }

  // 4. category filter
  if (filters.category && typeof filters.category === 'string' && filters.category.trim().length > 0) {
    const cat = filters.category.trim().toUpperCase();
    if (CONTROLLED_CATEGORIES.includes(cat)) {
      clauses.push(`${prefix}.category = $${paramIndex}`);
      params.push(cat);
      paramIndex++;
    }
  }

  // 5. status filter
  if (filters.status && typeof filters.status === 'string' && filters.status.trim().length > 0) {
    const stat = filters.status.trim().toUpperCase();
    clauses.push(`${prefix}.status = $${paramIndex}`);
    params.push(stat);
    paramIndex++;
  }

  // 6. authorityId filter (matches UUID or code)
  if (filters.authorityId && typeof filters.authorityId === 'string' && filters.authorityId.trim().length > 0) {
    const authVal = filters.authorityId.trim();
    clauses.push(`EXISTS (
      SELECT 1 FROM routing_decisions rd_f 
      WHERE rd_f.complaint_id = ${prefix}.id 
        AND (rd_f.authority_id::text = $${paramIndex} OR rd_f.authority_id IN (SELECT id FROM authorities WHERE code = $${paramIndex}))
    )`);
    params.push(authVal);
    paramIndex++;
  }

  // 7. departmentId filter (matches UUID or code)
  if (filters.departmentId && typeof filters.departmentId === 'string' && filters.departmentId.trim().length > 0) {
    const deptVal = filters.departmentId.trim();
    clauses.push(`EXISTS (
      SELECT 1 FROM routing_decisions rd_f 
      WHERE rd_f.complaint_id = ${prefix}.id 
        AND (rd_f.department_id::text = $${paramIndex} OR rd_f.department_id IN (SELECT id FROM departments WHERE code = $${paramIndex}))
    )`);
    params.push(deptVal);
    paramIndex++;
  }

  // 8. versionId filter (matches UUID or version_code)
  if (filters.versionId && typeof filters.versionId === 'string' && filters.versionId.trim().length > 0) {
    const verVal = filters.versionId.trim();
    clauses.push(`EXISTS (
      SELECT 1 FROM routing_decisions rd_f 
      WHERE rd_f.complaint_id = ${prefix}.id 
        AND (rd_f.jurisdiction_version_id::text = $${paramIndex} OR rd_f.jurisdiction_version_id IN (SELECT id FROM jurisdiction_versions WHERE version_code = $${paramIndex}))
    )`);
    params.push(verVal);
    paramIndex++;
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const andSql = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';

  return { whereSql, andSql, params, nextIndex: paramIndex };
}

/**
 * 1. Overview Metrics (SELECT-only)
 */
const getOverview = async (filters = {}) => {
  const { whereSql, params } = buildComplaintFilters(filters, 'c', 1);

  const query = `
    SELECT 
      COUNT(c.id)::int AS total_complaints,
      COUNT(c.id) FILTER (WHERE c.created_at >= CURRENT_DATE)::int AS complaints_today,
      COUNT(c.id) FILTER (WHERE c.status = 'SUBMITTED')::int AS submitted,
      COUNT(c.id) FILTER (WHERE c.status = 'TRIAGED')::int AS triaged,
      COUNT(c.id) FILTER (WHERE c.status = 'ROUTED')::int AS routed,
      COUNT(c.id) FILTER (WHERE c.status = 'IN_PROGRESS')::int AS in_progress,
      COUNT(c.id) FILTER (WHERE c.status = 'RESOLVED')::int AS resolved,
      COUNT(c.id) FILTER (WHERE c.status = 'CLOSED')::int AS closed,
      COUNT(c.id) FILTER (WHERE c.status = 'HUMAN_REVIEW')::int AS human_review,
      COUNT(c.id) FILTER (WHERE c.status NOT IN ('RESOLVED', 'CLOSED'))::int AS unresolved_open,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'AT_RISK')::int AS sla_warnings,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'SLA_BREACHED')::int AS sla_breaches,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'WITHIN_SLA' AND c.routed_at IS NOT NULL)::int AS sla_on_track,
      COUNT(c.id) FILTER (WHERE c.routed_at IS NOT NULL)::int AS sla_tracked
    FROM complaints c
    ${whereSql};
  `;

  const res = await pool.query(query, params);
  const row = res.rows[0] || {};

  // Query open human-in-the-loop reviews
  const reviewRes = await pool.query(`
    SELECT COUNT(id)::int AS open_reviews 
    FROM complaint_reviews 
    WHERE review_status IN ('OPEN', 'IN_REVIEW');
  `);
  const openReviews = reviewRes.rows[0]?.open_reviews || 0;

  // Query routing decisions count and success rate
  const routingRes = await pool.query(`
    SELECT 
      COUNT(id)::int AS total_decisions,
      COUNT(id) FILTER (WHERE routing_status = 'ROUTED')::int AS routed_decisions,
      COUNT(id) FILTER (WHERE routing_status = 'HUMAN_REVIEW')::int AS human_review_decisions
    FROM routing_decisions;
  `);
  const rRow = routingRes.rows[0] || {};
  const totalDecisions = rRow.total_decisions || 0;
  const routedDecisions = rRow.routed_decisions || 0;
  const humanReviewDecisions = rRow.human_review_decisions || 0;

  const totalComplaints = row.total_complaints || 0;
  const slaTracked = row.sla_tracked || 0;
  const slaOnTrack = row.sla_on_track || 0;
  const slaWarnings = row.sla_warnings || 0;

  // Rates with safe zero-denominator handling (return null, never fabricate 0% or 100%)
  const routingSuccessRate = totalDecisions > 0 
    ? Number(((routedDecisions / totalDecisions) * 100).toFixed(1)) 
    : null;

  const humanReviewRate = totalDecisions > 0 
    ? Number(((humanReviewDecisions / totalDecisions) * 100).toFixed(1)) 
    : null;

  const slaComplianceRate = slaTracked > 0 
    ? Number((((slaOnTrack + slaWarnings) / slaTracked) * 100).toFixed(1)) 
    : null;

  return {
    totalComplaints,
    complaintsToday: row.complaints_today || 0,
    statusBreakdown: {
      submitted: row.submitted || 0,
      triaged: row.triaged || 0,
      routed: row.routed || 0,
      inProgress: row.in_progress || 0,
      resolved: row.resolved || 0,
      closed: row.closed || 0,
      humanReview: row.human_review || 0
    },
    unresolvedOpen: row.unresolved_open || 0,
    slaWarnings: row.sla_warnings || 0,
    slaBreaches: row.sla_breaches || 0,
    slaOnTrack: row.sla_on_track || 0,
    slaTracked,
    openReviews,
    totalRoutingDecisions: totalDecisions,
    routingSuccessRate,
    humanReviewRate,
    slaComplianceRate,
    isDemoData: true
  };
};

/**
 * 2. Complaint Trends (SELECT-only, 7-day or 30-day series)
 */
const getComplaintTrends = async (filters = {}) => {
  const days = Number(filters.days) === 30 ? 30 : 7;
  const nonDateFilters = { ...filters };
  delete nonDateFilters.days;
  delete nonDateFilters.startDate;
  delete nonDateFilters.endDate;
  const { andSql, params } = buildComplaintFilters(nonDateFilters, 'c', 2);

  const query = `
    WITH dates AS (
      SELECT (CURRENT_DATE - i * INTERVAL '1 day')::date AS day
      FROM generate_series($1 - 1, 0, -1) AS i
    )
    SELECT 
      d.day::text AS date,
      COUNT(c.id)::int AS complaint_count,
      COUNT(c.id) FILTER (WHERE c.status IN ('ROUTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'))::int AS routed_count,
      COUNT(c.id) FILTER (WHERE c.status = 'HUMAN_REVIEW')::int AS human_review_count,
      COUNT(c.id) FILTER (WHERE c.status IN ('RESOLVED', 'CLOSED'))::int AS resolved_count
    FROM dates d
    LEFT JOIN complaints c ON c.created_at::date = d.day ${andSql}
    GROUP BY d.day
    ORDER BY d.day ASC;
  `;

  const res = await pool.query(query, [days, ...params]);
  return {
    days,
    trends: res.rows
  };
};

/**
 * 3. Category Breakdown (SELECT-only across controlled civic categories)
 */
const getCategoryBreakdown = async (filters = {}) => {
  const { whereSql, params } = buildComplaintFilters(filters, 'c', 1);

  const query = `
    SELECT 
      c.category,
      COUNT(c.id)::int AS count
    FROM complaints c
    ${whereSql}
    GROUP BY c.category
    ORDER BY count DESC, c.category ASC;
  `;

  const res = await pool.query(query, params);
  const foundMap = new Map();
  let total = 0;

  for (const r of res.rows) {
    foundMap.set(r.category, r.count);
    total += r.count;
  }

  // Include all controlled categories so operator sees complete civic domain coverage
  const categories = CONTROLLED_CATEGORIES.map((cat) => {
    const count = foundMap.get(cat) || 0;
    const percentage = total > 0 ? Number(((count / total) * 100).toFixed(1)) : null;
    return {
      category: cat,
      count,
      percentage
    };
  }).sort((a, b) => b.count - a.count);

  return {
    totalComplaints: total,
    categories
  };
};

/**
 * 4. Authority Workload & Performance (SELECT-only from routing decisions)
 * Uses stored routing decisions; does NOT infer authority from category!
 */
const getAuthorityPerformance = async (filters = {}) => {
  const clauses = ['a.is_active = TRUE'];
  const params = [];
  let pIdx = 1;

  if (filters.authorityId && typeof filters.authorityId === 'string' && filters.authorityId.trim().length > 0) {
    const authVal = filters.authorityId.trim();
    clauses.push(`(a.id::text = $${pIdx} OR a.code = $${pIdx})`);
    params.push(authVal);
    pIdx++;
  }

  const query = `
    SELECT 
      a.id AS authority_id,
      a.name AS authority_name,
      a.code AS authority_code,
      COUNT(rd.id) FILTER (WHERE rd.routing_status = 'ROUTED')::int AS routed_complaints,
      COUNT(c.id) FILTER (WHERE c.status IN ('ROUTED', 'IN_PROGRESS'))::int AS active_complaints,
      COUNT(c.id) FILTER (WHERE c.status IN ('RESOLVED', 'CLOSED'))::int AS resolved_complaints,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'AT_RISK')::int AS sla_warnings,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'SLA_BREACHED')::int AS sla_breaches,
      COUNT(rd.id) FILTER (WHERE rd.routing_status = 'HUMAN_REVIEW' OR c.status = 'HUMAN_REVIEW')::int AS human_review_cases
    FROM authorities a
    LEFT JOIN routing_decisions rd ON rd.authority_id = a.id
    LEFT JOIN complaints c ON rd.complaint_id = c.id
    WHERE ${clauses.join(' AND ')}
    GROUP BY a.id, a.name, a.code
    ORDER BY routed_complaints DESC, a.name ASC;
  `;

  const res = await pool.query(query, params);
  return res.rows.map((row) => ({
    authorityId: row.authority_id,
    authorityName: row.authority_name,
    authorityCode: row.authority_code,
    routedComplaints: row.routed_complaints,
    activeComplaints: row.active_complaints,
    resolvedComplaints: row.resolved_complaints,
    slaWarnings: row.sla_warnings,
    slaBreaches: row.sla_breaches,
    humanReviewCases: row.human_review_cases
  }));
};

/**
 * 5. Department Workload & Performance (SELECT-only from routing decisions)
 */
const getDepartmentPerformance = async (filters = {}) => {
  const clauses = ['d.is_active = TRUE'];
  const params = [];
  let pIdx = 1;

  if (filters.authorityId && typeof filters.authorityId === 'string' && filters.authorityId.trim().length > 0) {
    const authVal = filters.authorityId.trim();
    clauses.push(`(a.id::text = $${pIdx} OR a.code = $${pIdx})`);
    params.push(authVal);
    pIdx++;
  }

  if (filters.departmentId && typeof filters.departmentId === 'string' && filters.departmentId.trim().length > 0) {
    const deptVal = filters.departmentId.trim();
    clauses.push(`(d.id::text = $${pIdx} OR d.code = $${pIdx})`);
    params.push(deptVal);
    pIdx++;
  }

  const query = `
    SELECT 
      d.id AS department_id,
      d.name AS department_name,
      d.code AS department_code,
      a.id AS authority_id,
      a.name AS authority_name,
      a.code AS authority_code,
      COUNT(rd.id) FILTER (WHERE rd.routing_status = 'ROUTED')::int AS routed_complaints,
      COUNT(c.id) FILTER (WHERE c.status IN ('ROUTED', 'IN_PROGRESS'))::int AS active_complaints,
      COUNT(c.id) FILTER (WHERE c.status IN ('RESOLVED', 'CLOSED'))::int AS resolved_complaints,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'AT_RISK')::int AS sla_warnings,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'SLA_BREACHED')::int AS sla_breaches
    FROM departments d
    JOIN authorities a ON d.authority_id = a.id
    LEFT JOIN routing_decisions rd ON rd.department_id = d.id
    LEFT JOIN complaints c ON rd.complaint_id = c.id
    WHERE ${clauses.join(' AND ')}
    GROUP BY d.id, d.name, d.code, a.id, a.name, a.code
    ORDER BY routed_complaints DESC, d.name ASC;
  `;

  const res = await pool.query(query, params);
  return res.rows.map((row) => ({
    departmentId: row.department_id,
    departmentName: row.department_name,
    departmentCode: row.department_code,
    authorityId: row.authority_id,
    authorityName: row.authority_name,
    authorityCode: row.authority_code,
    routedComplaints: row.routed_complaints,
    activeComplaints: row.active_complaints,
    resolvedComplaints: row.resolved_complaints,
    slaWarnings: row.sla_warnings,
    slaBreaches: row.sla_breaches
  }));
};

/**
 * 6. Routing Intelligence (SELECT-only)
 */
const getRoutingAnalytics = async (filters = {}) => {
  const totalsQuery = `
    SELECT 
      COUNT(rd.id)::int AS total_decisions,
      COUNT(rd.id) FILTER (WHERE rd.routing_method = 'GIS_RULE')::int AS gis_rule_count,
      COUNT(rd.id) FILTER (WHERE rd.routing_method = 'HUMAN_REVIEW')::int AS human_review_method_count,
      COUNT(rd.id) FILTER (WHERE rd.routing_status = 'ROUTED')::int AS routed_count,
      COUNT(rd.id) FILTER (WHERE rd.routing_status = 'HUMAN_REVIEW')::int AS human_review_status_count,
      COUNT(rd.id) FILTER (WHERE rd.routing_status = 'UNROUTABLE')::int AS unroutable_count
    FROM routing_decisions rd;
  `;
  const tRes = await pool.query(totalsQuery);
  const tRow = tRes.rows[0] || {};
  const total = tRow.total_decisions || 0;

  const routingSuccessRate = total > 0 
    ? Number(((tRow.routed_count / total) * 100).toFixed(1)) 
    : null;

  const humanReviewRate = total > 0 
    ? Number(((tRow.human_review_status_count / total) * 100).toFixed(1)) 
    : null;

  // Breakdown 1: Category -> Authority
  const catAuthQuery = `
    SELECT 
      c.category,
      COALESCE(a.name, 'Unassigned') AS authority_name,
      COUNT(rd.id)::int AS count
    FROM routing_decisions rd
    JOIN complaints c ON rd.complaint_id = c.id
    LEFT JOIN authorities a ON rd.authority_id = a.id
    GROUP BY c.category, a.name
    ORDER BY count DESC, c.category ASC;
  `;
  const catAuthRes = await pool.query(catAuthQuery);

  // Breakdown 2: Jurisdiction -> Authority
  const jurAuthQuery = `
    SELECT 
      COALESCE(j.name, 'Outside Active Boundaries') AS jurisdiction_name,
      COALESCE(a.name, 'Unassigned') AS authority_name,
      COUNT(rd.id)::int AS count
    FROM routing_decisions rd
    LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
    LEFT JOIN authorities a ON rd.authority_id = a.id
    GROUP BY j.name, a.name
    ORDER BY count DESC;
  `;
  const jurAuthRes = await pool.query(jurAuthQuery);

  // Breakdown 3: Method -> Status
  const methodResultQuery = `
    SELECT 
      rd.routing_method,
      rd.routing_status,
      COUNT(rd.id)::int AS count
    FROM routing_decisions rd
    GROUP BY rd.routing_method, rd.routing_status
    ORDER BY count DESC;
  `;
  const methodResultRes = await pool.query(methodResultQuery);

  return {
    totalDecisions: total,
    gisRuleCount: tRow.gis_rule_count || 0,
    humanReviewMethodCount: tRow.human_review_method_count || 0,
    routedCount: tRow.routed_count || 0,
    humanReviewCount: tRow.human_review_status_count || 0,
    unroutableCount: tRow.unroutable_count || 0,
    routingSuccessRate,
    humanReviewRate,
    breakdowns: {
      categoryToAuthority: catAuthRes.rows,
      jurisdictionToAuthority: jurAuthRes.rows,
      methodToResult: methodResultRes.rows
    }
  };
};

/**
 * 7. SLA Analytics (SELECT-only, read-only guarantees)
 */
const getSlaAnalytics = async (filters = {}) => {
  const overviewQuery = `
    SELECT 
      COUNT(c.id) FILTER (WHERE c.routed_at IS NOT NULL)::int AS total_tracked,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'WITHIN_SLA' AND c.routed_at IS NOT NULL)::int AS on_track,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'AT_RISK' AND c.routed_at IS NOT NULL)::int AS warning,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'SLA_BREACHED' AND c.routed_at IS NOT NULL)::int AS breached,
      COUNT(c.id) FILTER (WHERE c.status IN ('RESOLVED', 'CLOSED') AND c.sla_status != 'SLA_BREACHED')::int AS resolved_within_sla,
      COUNT(c.id) FILTER (WHERE c.status IN ('RESOLVED', 'CLOSED') AND c.sla_status = 'SLA_BREACHED')::int AS resolved_breached
    FROM complaints c;
  `;
  const oRes = await pool.query(overviewQuery);
  const oRow = oRes.rows[0] || {};
  const totalTracked = oRow.total_tracked || 0;
  const onTrack = oRow.on_track || 0;
  const warning = oRow.warning || 0;
  const breached = oRow.breached || 0;

  const warningRate = totalTracked > 0 
    ? Number(((warning / totalTracked) * 100).toFixed(1)) 
    : null;

  const breachRate = totalTracked > 0 
    ? Number(((breached / totalTracked) * 100).toFixed(1)) 
    : null;

  const complianceRate = totalTracked > 0 
    ? Number((((onTrack + warning) / totalTracked) * 100).toFixed(1)) 
    : null;

  // Breakdown by category
  const byCatQuery = `
    SELECT 
      c.category,
      r.target_hours,
      r.warning_hours,
      COUNT(c.id)::int AS total,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'WITHIN_SLA')::int AS on_track,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'AT_RISK')::int AS warning,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'SLA_BREACHED')::int AS breached
    FROM complaints c
    LEFT JOIN complaint_sla_rules r ON c.category = r.category
    WHERE c.routed_at IS NOT NULL
    GROUP BY c.category, r.target_hours, r.warning_hours
    ORDER BY total DESC;
  `;
  const byCatRes = await pool.query(byCatQuery);
  const byCategory = byCatRes.rows.map((r) => ({
    category: r.category,
    targetHours: r.target_hours,
    warningHours: r.warning_hours,
    total: r.total,
    onTrack: r.on_track,
    warning: r.warning,
    breached: r.breached,
    complianceRate: r.total > 0 ? Number((((r.on_track + r.warning) / r.total) * 100).toFixed(1)) : null
  }));

  // Breakdown by authority
  const byAuthQuery = `
    SELECT 
      COALESCE(a.name, 'Unassigned') AS authority_name,
      COUNT(c.id)::int AS total,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'WITHIN_SLA')::int AS on_track,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'AT_RISK')::int AS warning,
      COUNT(c.id) FILTER (WHERE c.sla_status = 'SLA_BREACHED')::int AS breached
    FROM complaints c
    LEFT JOIN routing_decisions rd ON rd.complaint_id = c.id
    LEFT JOIN authorities a ON rd.authority_id = a.id
    WHERE c.routed_at IS NOT NULL
    GROUP BY a.name
    ORDER BY total DESC;
  `;
  const byAuthRes = await pool.query(byAuthQuery);
  const byAuthority = byAuthRes.rows.map((r) => ({
    authorityName: r.authority_name,
    total: r.total,
    onTrack: r.on_track,
    warning: r.warning,
    breached: r.breached,
    complianceRate: r.total > 0 ? Number((((r.on_track + r.warning) / r.total) * 100).toFixed(1)) : null
  }));

  return {
    totalTracked,
    onTrack,
    warning,
    breached,
    resolvedWithinSla: oRow.resolved_within_sla || 0,
    resolvedBreached: oRow.resolved_breached || 0,
    warningRate,
    breachRate,
    complianceRate,
    byCategory,
    byAuthority
  };
};

/**
 * 8. Human Review Analytics (SELECT-only from Stage 9 tables)
 */
const getReviewAnalytics = async (filters = {}) => {
  const reviewsQuery = `
    SELECT 
      COUNT(id)::int AS total_reviews,
      COUNT(id) FILTER (WHERE review_status = 'OPEN')::int AS open_count,
      COUNT(id) FILTER (WHERE review_status = 'IN_REVIEW')::int AS in_review_count,
      COUNT(id) FILTER (WHERE review_status = 'RESOLVED')::int AS resolved_count,
      COUNT(id) FILTER (WHERE review_status = 'REJECTED')::int AS rejected_count
    FROM complaint_reviews;
  `;
  const rRes = await pool.query(reviewsQuery);
  const rRow = rRes.rows[0] || {};

  // Actions breakdown
  const actionsQuery = `
    SELECT 
      COUNT(id) FILTER (WHERE action_type = 'ROUTE_TO_AUTHORITY')::int AS human_routed_count,
      COUNT(id) FILTER (WHERE action_type = 'MARK_UNROUTABLE')::int AS unroutable_count
    FROM complaint_review_actions;
  `;
  const aRes = await pool.query(actionsQuery);
  const aRow = aRes.rows[0] || {};

  // Average turnaround time (hours) calculated from real timestamps
  const turnaroundQuery = `
    SELECT ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)::numeric, 1) AS avg_turnaround_hours
    FROM complaint_reviews
    WHERE review_status IN ('RESOLVED', 'REJECTED')
      AND resolved_at IS NOT NULL;
  `;
  const tRes = await pool.query(turnaroundQuery);
  const avgHours = tRes.rows[0]?.avg_turnaround_hours;
  const averageTurnaroundHours = avgHours !== null && avgHours !== undefined ? Number(avgHours) : null;

  return {
    totalReviews: rRow.total_reviews || 0,
    open: rRow.open_count || 0,
    inReview: rRow.in_review_count || 0,
    resolved: rRow.resolved_count || 0,
    rejected: rRow.rejected_count || 0,
    humanRoutedCases: aRow.human_routed_count || 0,
    unroutableCases: aRow.unroutable_count || 0,
    averageTurnaroundHours
  };
};

/**
 * 9. Jurisdiction Analytics (CRITICAL HISTORICAL PROVENANCE)
 * Groups strictly by stored routing_decisions.jurisdiction_version_id.
 * NEVER recalculates historical points against active version!
 */
const getJurisdictionAnalytics = async (filters = {}) => {
  const clauses = [];
  const params = [];
  let pIdx = 1;

  if (filters.versionId && typeof filters.versionId === 'string' && filters.versionId.trim().length > 0) {
    const verVal = filters.versionId.trim();
    clauses.push(`(jv.id::text = $${pIdx} OR jv.version_code = $${pIdx})`);
    params.push(verVal);
    pIdx++;
  }

  if (filters.authorityId && typeof filters.authorityId === 'string' && filters.authorityId.trim().length > 0) {
    const authVal = filters.authorityId.trim();
    clauses.push(`(a.id::text = $${pIdx} OR a.code = $${pIdx})`);
    params.push(authVal);
    pIdx++;
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const query = `
    SELECT 
      jv.id AS version_id,
      jv.version_code,
      jv.version_number,
      jv.status AS version_status,
      j.id AS jurisdiction_id,
      COALESCE(j.name, 'Unassigned / Out-of-bounds') AS jurisdiction_name,
      COALESCE(j.code, 'N/A') AS jurisdiction_code,
      a.id AS authority_id,
      COALESCE(a.name, 'Unassigned') AS authority_name,
      COALESCE(a.code, 'NONE') AS authority_code,
      COUNT(rd.id)::int AS complaint_count,
      COUNT(rd.id) FILTER (WHERE rd.routing_status = 'ROUTED')::int AS routed_count,
      COUNT(rd.id) FILTER (WHERE rd.routing_status = 'HUMAN_REVIEW')::int AS human_review_count,
      COUNT(rd.id) FILTER (WHERE rd.routing_status = 'UNROUTABLE')::int AS unroutable_count
    FROM routing_decisions rd
    JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
    LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
    LEFT JOIN authorities a ON rd.authority_id = a.id
    ${whereSql}
    GROUP BY jv.id, jv.version_code, jv.version_number, jv.status, j.id, j.name, j.code, a.id, a.name, a.code
    ORDER BY jv.version_number DESC, complaint_count DESC;
  `;

  const res = await pool.query(query, params);

  // Version-level provenance summary
  const versionSummaryMap = new Map();
  for (const row of res.rows) {
    if (!versionSummaryMap.has(row.version_code)) {
      versionSummaryMap.set(row.version_code, {
        versionId: row.version_id,
        versionCode: row.version_code,
        versionNumber: row.version_number,
        versionStatus: row.version_status,
        totalComplaints: 0,
        routedComplaints: 0,
        humanReviewComplaints: 0,
        unroutableComplaints: 0,
        jurisdictions: []
      });
    }

    const ver = versionSummaryMap.get(row.version_code);
    ver.totalComplaints += row.complaint_count;
    ver.routedComplaints += row.routed_count;
    ver.humanReviewComplaints += row.human_review_count;
    ver.unroutableComplaints += row.unroutable_count;
    ver.jurisdictions.push({
      jurisdictionId: row.jurisdiction_id,
      jurisdictionName: row.jurisdiction_name,
      jurisdictionCode: row.jurisdiction_code,
      authorityId: row.authority_id,
      authorityName: row.authority_name,
      authorityCode: row.authority_code,
      complaintCount: row.complaint_count,
      routedCount: row.routed_count
    });
  }

  return {
    versionProvenances: Array.from(versionSummaryMap.values()),
    records: res.rows
  };
};

/**
 * 10. Spatial Analytics (SELECT-only from PostGIS)
 * Uses actual complaint coordinates from PostgreSQL.
 * Clearly labeled as Spatial Complaint Distribution / Complaint Concentration.
 */
const getSpatialAnalytics = async (filters = {}) => {
  const { whereSql, params } = buildComplaintFilters(filters, 'c', 1);

  // 1. Complaint points
  const pointsQuery = `
    SELECT 
      c.id,
      c.complaint_code,
      c.latitude::float,
      c.longitude::float,
      c.category,
      c.status,
      c.sla_status,
      c.created_at,
      a.name AS authority_name,
      a.code AS authority_code,
      j.name AS jurisdiction_name,
      rd.routing_status,
      rd.routing_method
    FROM complaints c
    LEFT JOIN routing_decisions rd ON rd.complaint_id = c.id
    LEFT JOIN authorities a ON rd.authority_id = a.id
    LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
    ${whereSql}
    ORDER BY c.created_at DESC
    LIMIT 200;
  `;
  const pRes = await pool.query(pointsQuery, params);

  // 2. Spatial distribution by jurisdiction
  const jurDistQuery = `
    SELECT 
      COALESCE(j.name, 'Unassigned / Outside Active Boundary') AS jurisdiction_name,
      COALESCE(a.name, 'Unassigned') AS authority_name,
      COUNT(c.id)::int AS count
    FROM complaints c
    LEFT JOIN routing_decisions rd ON rd.complaint_id = c.id
    LEFT JOIN authorities a ON rd.authority_id = a.id
    LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
    ${whereSql}
    GROUP BY j.name, a.name
    ORDER BY count DESC;
  `;
  const jdRes = await pool.query(jurDistQuery, params);

  // 3. Real PostGIS Spatial Concentration Clusters (ST_ClusterDBSCAN)
  let clusters = [];
  try {
    const clusterQuery = `
      WITH clustered AS (
        SELECT 
          c.id,
          c.complaint_code,
          c.latitude::float,
          c.longitude::float,
          c.category,
          ST_ClusterDBSCAN(c.location, eps := 0.008, minpoints := 2) OVER () AS cluster_id
        FROM complaints c
        ${whereSql}
      )
      SELECT 
        cluster_id,
        COUNT(*)::int AS point_count,
        ROUND(AVG(latitude)::numeric, 6)::float AS center_lat,
        ROUND(AVG(longitude)::numeric, 6)::float AS center_lng
      FROM clustered
      WHERE cluster_id IS NOT NULL
      GROUP BY cluster_id
      ORDER BY point_count DESC;
    `;
    const cRes = await pool.query(clusterQuery, params);
    clusters = cRes.rows;
  } catch (clusterErr) {
    console.warn('[PostGIS Cluster Warning]', clusterErr.message);
  }

  return {
    distributionName: 'Spatial Complaint Distribution',
    totalMappedComplaints: pRes.rows.length,
    complaintPoints: pRes.rows,
    jurisdictionDistribution: jdRes.rows,
    spatialConcentrationClusters: clusters
  };
};

module.exports = {
  CONTROLLED_CATEGORIES,
  getOverview,
  getComplaintTrends,
  getCategoryBreakdown,
  getAuthorityPerformance,
  getDepartmentPerformance,
  getRoutingAnalytics,
  getSlaAnalytics,
  getReviewAnalytics,
  getJurisdictionAnalytics,
  getSpatialAnalytics
};
