-- Migration: 012_immutable_audit_logs.sql
-- Description: Immutable audit trail and security event log table with PostgreSQL-level immutability trigger
-- Stage: Stage 13 — Immutable Audit Trail & Security Event Auditing

--------------------------------------------------------------------------------
-- 1. Create audit_logs Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NULL,
    actor_role VARCHAR(50) NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NULL,
    result VARCHAR(50) NOT NULL, -- e.g. 'SUCCESS', 'FAILURE'
    reason TEXT NULL,
    metadata JSONB NULL DEFAULT '{}'::jsonb,
    ip_address INET NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

--------------------------------------------------------------------------------
-- 2. Performance Indexes for Audit Queries & Filtering
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at 
    ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id 
    ON audit_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action 
    ON audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity 
    ON audit_logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_result 
    ON audit_logs (result);

--------------------------------------------------------------------------------
-- 3. Database Engine-Level Immutability Enforcement
-- Forbids any UPDATE or DELETE operations on audit_logs records.
-- INSERT remains completely unrestricted.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs records are immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();
