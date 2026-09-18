-- Migration: 003_jurisdiction_versioning_audit.sql
-- Description: Jurisdiction versioning lifecycle (DRAFT, ACTIVE, RETIRED), audit logging, and single active version constraint
-- Stage: Stage 3 — Jurisdiction Versioning & Boundary Management

--------------------------------------------------------------------------------
-- 1. Update jurisdiction_versions Status Constraint & Timestamps
--------------------------------------------------------------------------------

-- Drop old status check constraint and apply new lifecycle statuses: DRAFT, ACTIVE, RETIRED, ARCHIVED
ALTER TABLE jurisdiction_versions 
    DROP CONSTRAINT IF EXISTS jurisdiction_versions_status_check;

ALTER TABLE jurisdiction_versions 
    ADD CONSTRAINT jurisdiction_versions_status_check 
    CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED', 'ARCHIVED'));

-- Add activation and retirement tracking timestamps
ALTER TABLE jurisdiction_versions 
    ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS retired_at TIMESTAMP WITH TIME ZONE;

-- Mark currently active versions as activated
UPDATE jurisdiction_versions 
SET activated_at = created_at 
WHERE status = 'ACTIVE' AND activated_at IS NULL;

-- Enforce that ONLY ONE version can be ACTIVE at any time across the database
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_version 
    ON jurisdiction_versions (status) 
    WHERE status = 'ACTIVE';

--------------------------------------------------------------------------------
-- 2. Create Audit Trail Table for Version Lifecycle Transitions
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_version_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(50) NOT NULL, -- e.g. 'VERSION_ACTIVATED', 'VERSION_CREATED', 'VERSION_RETIRED'
    previous_version_id UUID REFERENCES jurisdiction_versions(id) ON DELETE SET NULL,
    new_version_id UUID REFERENCES jurisdiction_versions(id) ON DELETE SET NULL,
    previous_version_code VARCHAR(100),
    new_version_code VARCHAR(100),
    operator VARCHAR(100) DEFAULT 'demo_administrator',
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_transitions_action 
    ON audit_version_transitions (action);

CREATE INDEX IF NOT EXISTS idx_audit_transitions_created_at 
    ON audit_version_transitions (created_at DESC);
