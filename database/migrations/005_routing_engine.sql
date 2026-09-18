-- Migration: 005_routing_engine.sql
-- Description: Deterministic Civic Routing Engine schema, category-to-department mappings, and routing decisions table
-- Stage: Stage 5 — Deterministic Civic Routing Engine

--------------------------------------------------------------------------------
-- 1. Ensure Additional Demo Departments Exist for Complete Civic Coverage
--------------------------------------------------------------------------------
INSERT INTO departments (id, authority_id, name, code, description)
VALUES 
    ('d0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'Water Supply & Sewerage (DEMO)', 'MCC_WATER', 'Municipal water supply and pipeline maintenance'),
    ('d0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000002', 'Roads & Infrastructure (DEMO)', 'MUDA_ROADS', 'Development authority road and arterial maintenance'),
    ('d0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000002', 'Water & Utility Services (DEMO)', 'MUDA_WATER', 'Sector utility lines and water management')
ON CONFLICT (id) DO NOTHING;

--------------------------------------------------------------------------------
-- 2. Category to Department Mapping Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS category_department_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authority_id UUID NOT NULL REFERENCES authorities(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_authority_category UNIQUE (authority_id, category)
);

-- Seed MCC Mappings (Authority: a0000000-0000-0000-0000-000000000001)
INSERT INTO category_department_mappings (authority_id, category, department_id)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'POTHOLE', 'd0000000-0000-0000-0000-000000000001'), -- MCC Roads & Infrastructure
    ('a0000000-0000-0000-0000-000000000001', 'GARBAGE', 'd0000000-0000-0000-0000-000000000002'), -- MCC Solid Waste Management
    ('a0000000-0000-0000-0000-000000000001', 'ILLEGAL_DUMPING', 'd0000000-0000-0000-0000-000000000002'), -- MCC Solid Waste Management
    ('a0000000-0000-0000-0000-000000000001', 'C_AND_D_WASTE', 'd0000000-0000-0000-0000-000000000002'), -- MCC Solid Waste Management
    ('a0000000-0000-0000-0000-000000000001', 'STREETLIGHT', 'd0000000-0000-0000-0000-000000000004'), -- MCC Street Lighting
    ('a0000000-0000-0000-0000-000000000001', 'DRAINAGE', 'd0000000-0000-0000-0000-000000000005'), -- MCC Storm Water Drainage
    ('a0000000-0000-0000-0000-000000000001', 'WATER_LEAK', 'd0000000-0000-0000-0000-000000000008')  -- MCC Water Supply & Sewerage
ON CONFLICT (authority_id, category) DO UPDATE SET department_id = EXCLUDED.department_id;

-- Seed MUDA Mappings (Authority: a0000000-0000-0000-0000-000000000002)
INSERT INTO category_department_mappings (authority_id, category, department_id)
VALUES
    ('a0000000-0000-0000-0000-000000000002', 'POTHOLE', 'd0000000-0000-0000-0000-000000000009'), -- MUDA Roads & Infrastructure
    ('a0000000-0000-0000-0000-000000000002', 'GARBAGE', 'd0000000-0000-0000-0000-000000000007'), -- MUDA Sector Maintenance
    ('a0000000-0000-0000-0000-000000000002', 'ILLEGAL_DUMPING', 'd0000000-0000-0000-0000-000000000007'), -- MUDA Sector Maintenance
    ('a0000000-0000-0000-0000-000000000002', 'C_AND_D_WASTE', 'd0000000-0000-0000-0000-000000000007'), -- MUDA Sector Maintenance
    ('a0000000-0000-0000-0000-000000000002', 'STREETLIGHT', 'd0000000-0000-0000-0000-000000000007'), -- MUDA Sector Maintenance
    ('a0000000-0000-0000-0000-000000000002', 'DRAINAGE', 'd0000000-0000-0000-0000-000000000007'), -- MUDA Sector Maintenance
    ('a0000000-0000-0000-0000-000000000002', 'WATER_LEAK', 'd0000000-0000-0000-0000-000000000010')  -- MUDA Water & Utility Services
ON CONFLICT (authority_id, category) DO UPDATE SET department_id = EXCLUDED.department_id;

--------------------------------------------------------------------------------
-- 3. Routing Decisions Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routing_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    jurisdiction_version_id UUID NOT NULL REFERENCES jurisdiction_versions(id) ON DELETE RESTRICT,
    jurisdiction_id UUID REFERENCES jurisdictions(id) ON DELETE SET NULL,
    authority_id UUID REFERENCES authorities(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    routing_status VARCHAR(30) NOT NULL CHECK (routing_status IN ('ROUTED', 'HUMAN_REVIEW', 'UNROUTABLE')),
    routing_method VARCHAR(30) NOT NULL CHECK (routing_method IN ('GIS_RULE', 'HUMAN_REVIEW')),
    reason TEXT NOT NULL,
    matched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_complaint_routing UNIQUE (complaint_id)
);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_complaint_id 
    ON routing_decisions (complaint_id);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_version_id 
    ON routing_decisions (jurisdiction_version_id);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_authority_id 
    ON routing_decisions (authority_id);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_department_id 
    ON routing_decisions (department_id);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_status 
    ON routing_decisions (routing_status);

CREATE INDEX IF NOT EXISTS idx_routing_decisions_created_at 
    ON routing_decisions (created_at DESC);
