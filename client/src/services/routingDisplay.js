/**
 * Routing Engine display helpers for consistent, evidence-based formatting
 * of authority, department, jurisdiction, version, spatial reasons, and timestamps.
 */

export const isOutsideBoundaryDecision = (d) => {
  if (!d) return false;

  // If a jurisdiction or authority exists, this decision is NOT outside boundaries
  const hasJurisdiction = Boolean(d.jurisdiction?.name || d.jurisdiction_name || d.jurisdiction_id || d.jurisdictionId);
  const hasAuthority = Boolean(d.authority?.name || d.authority_name || d.authority_id || d.authorityId);
  if (hasJurisdiction || hasAuthority) {
    return false;
  }

  // Check stored reason or method for explicit boundary containment failure evidence
  const reasonText = (d.reason || d.routing_reason || '').toLowerCase();
  if (
    reasonText.includes('outside') ||
    reasonText.includes('no active jurisdiction') ||
    reasonText.includes('not covered') ||
    reasonText.includes('containment failure')
  ) {
    return true;
  }

  // If neither jurisdiction nor authority is stored in a HUMAN_REVIEW or UNROUTABLE decision,
  // this confirms there was no spatial jurisdiction match
  const status = d.routing_status || d.routingStatus;
  if ((status === 'HUMAN_REVIEW' || status === 'UNROUTABLE') && !hasJurisdiction && !hasAuthority) {
    return true;
  }

  return false;
};

export const getDecisionAuthority = (d) => {
  if (!d) return 'None';
  if (d.authority?.name) return d.authority.name;
  if (d.authority_name) return d.authority_name;
  if (isOutsideBoundaryDecision(d)) {
    return 'None (Outside Boundaries)';
  }
  return 'None';
};

export const getDecisionDepartment = (d) => {
  if (!d) return 'Unassigned';
  if (d.department?.name) return d.department.name;
  if (d.department_name) return d.department_name;
  const status = d.routing_status || d.routingStatus;
  if (status === 'HUMAN_REVIEW' || status === 'UNROUTABLE' || isOutsideBoundaryDecision(d)) {
    return 'Human Review Queue';
  }
  return 'Unassigned';
};

export const getDecisionJurisdiction = (d) => {
  if (!d) return 'None';
  if (d.jurisdiction?.name) return d.jurisdiction.name;
  if (d.jurisdiction_name) return d.jurisdiction_name;
  return 'None';
};

export const getDecisionVersion = (d) => {
  if (!d) return 'N/A';
  if (d.jurisdictionVersion?.code) return d.jurisdictionVersion.code;
  if (d.version_code) return d.version_code;
  return 'N/A';
};

export const getDecisionReason = (d) => {
  if (!d) return 'Reason not available';
  const reason = d.reason || d.routing_reason;
  if (reason && typeof reason === 'string' && reason.trim().length > 0) {
    return reason.trim();
  }
  if (isOutsideBoundaryDecision(d)) {
    return 'Complaint coordinates are outside all configured jurisdiction boundaries. Flagged for human review.';
  }
  const status = d.routing_status || d.routingStatus;
  if (status === 'HUMAN_REVIEW') {
    return 'Complaint flagged for human review.';
  }
  if (status === 'UNROUTABLE') {
    return 'Complaint location could not be routed to any jurisdiction.';
  }
  if (status === 'ROUTED') {
    return 'Deterministically routed via PostGIS spatial boundary containment.';
  }
  return 'Reason not available';
};

export const formatRoutingTimestamp = (timestamp) => {
  if (!timestamp) return 'Not available';
  const parsed = new Date(timestamp);
  if (isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString();
};

export const getDecisionTimestamp = (d) => {
  if (!d) return 'Not available';
  const candidates = [
    d.routed_at,
    d.matchedAt,
    d.matched_at,
    d.createdAt,
    d.created_at
  ];
  for (const ts of candidates) {
    if (ts !== undefined && ts !== null && ts !== '') {
      const parsed = new Date(ts);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleString();
      }
    }
  }
  return 'Not available';
};
