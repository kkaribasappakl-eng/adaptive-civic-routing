-- Migration: 002_core_gis_schema.sql
-- Description: Core spatial schema for authorities, departments, jurisdiction versions, and PostGIS boundary polygons
-- Stage: Stage 2 — Database + GIS Foundation

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 1. Authorities Table
CREATE TABLE IF NOT EXISTS authorities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authority_id UUID NOT NULL REFERENCES authorities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_authority_dept_code UNIQUE (authority_id, code)
);

-- 3. Jurisdiction Versions Table (Temporal lifecycle management)
CREATE TABLE IF NOT EXISTS jurisdiction_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_code VARCHAR(100) UNIQUE NOT NULL,
    version_number INTEGER NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    effective_to TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
    source VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jurisdiction_versions_status 
    ON jurisdiction_versions (status) 
    WHERE status = 'ACTIVE';

-- 4. Jurisdictions Table (Spatial boundary polygons)
CREATE TABLE IF NOT EXISTS jurisdictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_version_id UUID NOT NULL REFERENCES jurisdiction_versions(id) ON DELETE CASCADE,
    authority_id UUID NOT NULL REFERENCES authorities(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) NOT NULL,
    boundary geometry(MultiPolygon, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_version_jurisdiction_code UNIQUE (jurisdiction_version_id, code)
);

-- GIST spatial index on boundary
CREATE INDEX IF NOT EXISTS idx_jurisdictions_boundary 
    ON jurisdictions USING GIST (boundary);

CREATE INDEX IF NOT EXISTS idx_jurisdictions_version_id 
    ON jurisdictions (jurisdiction_version_id);

CREATE INDEX IF NOT EXISTS idx_jurisdictions_authority_id 
    ON jurisdictions (authority_id);
