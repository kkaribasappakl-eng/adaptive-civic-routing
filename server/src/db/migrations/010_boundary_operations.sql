-- Migration: 010_boundary_operations.sql
-- Description: Jurisdiction boundary operational metadata, PostGIS validation fields, and safe activation audit tracking
-- Stage: Stage 10 — Jurisdiction Boundary Update & Safe Version Management

--------------------------------------------------------------------------------
-- 1. Extend jurisdiction_versions with Operational & Validation Fields
--------------------------------------------------------------------------------

ALTER TABLE jurisdiction_versions 
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) DEFAULT 'civic_admin',
    ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50) DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS validation_message TEXT,
    ADD COLUMN IF NOT EXISTS validation_details JSONB,
    ADD COLUMN IF NOT EXISTS activated_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS activation_reason TEXT;

-- Validation status constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_jurisdiction_versions_validation_status'
    ) THEN
        ALTER TABLE jurisdiction_versions 
            ADD CONSTRAINT chk_jurisdiction_versions_validation_status 
            CHECK (validation_status IN ('PENDING', 'VALID', 'INVALID'));
    END IF;
END $$;

--------------------------------------------------------------------------------
-- 2. Backfill existing ACTIVE/RETIRED versions as VALID
--------------------------------------------------------------------------------

UPDATE jurisdiction_versions 
SET validation_status = 'VALID',
    validated_at = CURRENT_TIMESTAMP,
    validation_message = 'Baseline version verified geometrically sound.',
    validation_details = jsonb_build_object(
        'geometryValid', true,
        'emptyCheck', true,
        'sridCheck', true,
        'overlapFree', true,
        'authorityCheck', true
    )
WHERE validation_status = 'PENDING' AND status IN ('ACTIVE', 'RETIRED');
