-- Migration: 004_complaints.sql
-- Description: Citizen complaints table with PostGIS Point geometry and GiST index
-- Stage: Stage 4 — Citizen Complaint Intake & AI-Assisted Issue Classification

--------------------------------------------------------------------------------
-- 1. Complaint Code Sequence for Safe Monotonic Identifier Generation
--------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS complaint_code_seq START WITH 1;

--------------------------------------------------------------------------------
-- 2. Complaints Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    category_source VARCHAR(30) NOT NULL,
    category_confidence NUMERIC(5, 4),
    photo_url VARCHAR(255),
    location GEOMETRY(Point, 4326) NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    citizen_contact VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_complaint_category CHECK (
        category IN ('GARBAGE', 'ILLEGAL_DUMPING', 'POTHOLE', 'DRAINAGE', 'STREETLIGHT', 'C_AND_D_WASTE', 'WATER_LEAK', 'OTHER')
    ),
    CONSTRAINT chk_complaint_category_source CHECK (
        category_source IN ('AI_SUGGESTED', 'CITIZEN_SELECTED', 'MANUAL')
    ),
    CONSTRAINT chk_complaint_status CHECK (
        status IN ('SUBMITTED', 'TRIAGED', 'ROUTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED')
    )
);

--------------------------------------------------------------------------------
-- 3. Spatial & B-Tree Indexes
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_complaints_location 
    ON complaints USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_complaints_code 
    ON complaints (complaint_code);

CREATE INDEX IF NOT EXISTS idx_complaints_category 
    ON complaints (category);

CREATE INDEX IF NOT EXISTS idx_complaints_status 
    ON complaints (status);

CREATE INDEX IF NOT EXISTS idx_complaints_created_at 
    ON complaints (created_at DESC);
