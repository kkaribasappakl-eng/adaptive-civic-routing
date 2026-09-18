-- Migration: 006_case_status.sql
-- Description: Case status workflow, complaint status constraints, and append-only status history table
-- Stage: Stage 6 — Case Status & Citizen Follow-Through

--------------------------------------------------------------------------------
-- 1. Update Complaint Status Check Constraint
--------------------------------------------------------------------------------
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS chk_complaint_status;

ALTER TABLE complaints ADD CONSTRAINT chk_complaint_status CHECK (
    status IN ('SUBMITTED', 'TRIAGED', 'ROUTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'HUMAN_REVIEW', 'REJECTED')
);

--------------------------------------------------------------------------------
-- 2. Create Complaint Status History Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    previous_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    changed_by VARCHAR(100) DEFAULT 'system_operator',
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_history_status CHECK (
        new_status IN ('SUBMITTED', 'TRIAGED', 'ROUTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'HUMAN_REVIEW', 'REJECTED')
    )
);

--------------------------------------------------------------------------------
-- 3. Create Indexes for High-Performance Audit Queries
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_status_history_complaint_id 
    ON complaint_status_history (complaint_id);

CREATE INDEX IF NOT EXISTS idx_status_history_created_at 
    ON complaint_status_history (created_at DESC);

--------------------------------------------------------------------------------
-- 4. Backfill Initial History for Existing Complaints
--------------------------------------------------------------------------------
-- Ensures existing Stage 4/5 complaints have an initial baseline history entry
INSERT INTO complaint_status_history (
    complaint_id,
    previous_status,
    new_status,
    changed_by,
    reason,
    created_at
)
SELECT 
    c.id,
    NULL,
    c.status,
    'system_intake',
    'Historical baseline intake status recorded prior to Stage 6 activation',
    c.created_at
FROM complaints c
WHERE NOT EXISTS (
    SELECT 1 FROM complaint_status_history h WHERE h.complaint_id = c.id
);
