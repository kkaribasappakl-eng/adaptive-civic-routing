-- Migration: 007_sla_tracking.sql
-- Description: SLA configuration rules, complaint SLA fields, and append-only SLA escalation events
-- Stage: Stage 7 — SLA Tracking & Escalation

--------------------------------------------------------------------------------
-- 1. Create SLA Rules Configuration Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_sla_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL UNIQUE,
    target_hours INTEGER NOT NULL CHECK (target_hours > 0),
    warning_hours INTEGER NOT NULL CHECK (warning_hours > 0 AND warning_hours < target_hours),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Sensible DEMO SLA Rules for all 8 controlled civic categories
-- Note: These benchmarks are Demo SLA configurations for the HackMysuru system and not official municipal policy.
INSERT INTO complaint_sla_rules (category, target_hours, warning_hours, description)
VALUES
    ('WATER_LEAK', 12, 8, 'Demo SLA: Critical potable water network leaks and pipeline ruptures'),
    ('STREETLIGHT', 24, 16, 'Demo SLA: Dark spots and non-functioning streetlighting'),
    ('GARBAGE', 24, 18, 'Demo SLA: Unattended municipal solid waste collection points'),
    ('DRAINAGE', 48, 36, 'Demo SLA: Blocked storm water drains and monsoon overflow hazards'),
    ('ILLEGAL_DUMPING', 48, 36, 'Demo SLA: Unauthorized dumping in vacant layouts and waterbodies'),
    ('POTHOLE', 72, 48, 'Demo SLA: Asphalt failure and road surface defects'),
    ('C_AND_D_WASTE', 72, 48, 'Demo SLA: Construction and demolition debris clearance'),
    ('OTHER', 96, 72, 'Demo SLA: Uncategorized or multi-departmental citizen reports')
ON CONFLICT (category) DO UPDATE
SET target_hours = EXCLUDED.target_hours,
    warning_hours = EXCLUDED.warning_hours,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

--------------------------------------------------------------------------------
-- 2. Extend Complaints Table with Persisted SLA and Routing Timestamps
--------------------------------------------------------------------------------
-- Add persisted routed_at if not present
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS routed_at TIMESTAMP WITH TIME ZONE;

-- Add SLA target, warning, status, and breach timestamps
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS sla_warning_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS sla_target_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS sla_status VARCHAR(30) DEFAULT 'WITHIN_SLA';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMP WITH TIME ZONE;

-- Add constraint for allowed SLA statuses
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS chk_complaint_sla_status;
ALTER TABLE complaints ADD CONSTRAINT chk_complaint_sla_status 
    CHECK (sla_status IN ('WITHIN_SLA', 'AT_RISK', 'SLA_BREACHED'));

--------------------------------------------------------------------------------
-- 3. Create Append-Only SLA Events Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_sla_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    previous_sla_status VARCHAR(30),
    new_sla_status VARCHAR(30) NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('SLA_INITIALIZED', 'SLA_WARNING', 'SLA_BREACHED')),
    reason TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

--------------------------------------------------------------------------------
-- 4. High-Performance Indexes
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_complaints_sla_status 
    ON complaints (sla_status);

CREATE INDEX IF NOT EXISTS idx_complaints_sla_target_at 
    ON complaints (sla_target_at);

CREATE INDEX IF NOT EXISTS idx_complaints_routed_at 
    ON complaints (routed_at);

CREATE INDEX IF NOT EXISTS idx_sla_events_complaint_id 
    ON complaint_sla_events (complaint_id);

CREATE INDEX IF NOT EXISTS idx_sla_events_created_at 
    ON complaint_sla_events (created_at DESC);

--------------------------------------------------------------------------------
-- 5. Backfill Existing Routed Complaints Using Real Persisted PostgreSQL Timestamps
--------------------------------------------------------------------------------
-- Backfill routed_at from routing_decisions or status history
UPDATE complaints c
SET routed_at = COALESCE(
    (SELECT rd.matched_at FROM routing_decisions rd WHERE rd.complaint_id = c.id LIMIT 1),
    (SELECT csh.created_at FROM complaint_status_history csh WHERE csh.complaint_id = c.id AND csh.new_status = 'ROUTED' ORDER BY csh.created_at ASC LIMIT 1),
    c.created_at
)
WHERE c.routed_at IS NULL 
  AND c.status IN ('ROUTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- Backfill sla_warning_at and sla_target_at using real persisted routed_at + rule hours
UPDATE complaints c
SET 
    sla_warning_at = c.routed_at + (r.warning_hours * INTERVAL '1 hour'),
    sla_target_at = c.routed_at + (r.target_hours * INTERVAL '1 hour'),
    sla_status = CASE 
        WHEN c.status IN ('RESOLVED', 'CLOSED') THEN 'WITHIN_SLA'
        WHEN CURRENT_TIMESTAMP >= (c.routed_at + (r.target_hours * INTERVAL '1 hour')) THEN 'SLA_BREACHED'
        WHEN CURRENT_TIMESTAMP >= (c.routed_at + (r.warning_hours * INTERVAL '1 hour')) THEN 'AT_RISK'
        ELSE 'WITHIN_SLA'
    END,
    sla_breached_at = CASE 
        WHEN c.status NOT IN ('RESOLVED', 'CLOSED') 
         AND CURRENT_TIMESTAMP >= (c.routed_at + (r.target_hours * INTERVAL '1 hour')) THEN CURRENT_TIMESTAMP
        ELSE NULL
    END
FROM complaint_sla_rules r
WHERE c.category = r.category
  AND c.routed_at IS NOT NULL
  AND c.sla_target_at IS NULL;

-- Insert initial baseline SLA_INITIALIZED event for existing routed complaints
INSERT INTO complaint_sla_events (
    complaint_id,
    previous_sla_status,
    new_sla_status,
    event_type,
    reason,
    created_at
)
SELECT 
    c.id,
    NULL,
    c.sla_status,
    'SLA_INITIALIZED',
    'Historical baseline SLA initialized from persisted routing timestamp',
    c.routed_at
FROM complaints c
WHERE c.routed_at IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM complaint_sla_events e WHERE e.complaint_id = c.id
  );
