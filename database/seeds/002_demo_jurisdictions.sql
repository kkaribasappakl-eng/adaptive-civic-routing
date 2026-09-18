-- Seed: 002_demo_jurisdictions.sql
-- Description: DEMO / TEST JURISDICTION DATA for Mysuru (Synthetic Prototype Geometry)
-- Disclaimer: Demo jurisdiction polygons are synthetic test geometry and are not presented as official government boundaries.
-- Stage: Stage 2 — Database + GIS Foundation

-- 1. Authorities Seed (DEMO)
INSERT INTO authorities (id, name, code, description, is_active)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'Mysuru City Corporation (DEMO)', 'MCC_DEMO', 'Demarcated urban civic local body responsible for central municipal zones', true),
    ('a0000000-0000-0000-0000-000000000002', 'Mysuru Urban Development Authority (DEMO)', 'MUDA_DEMO', 'Planning and peripheral development authority for urban development sectors', true)
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 2. Demonstration Departments
INSERT INTO departments (id, authority_id, name, code, description, is_active)
VALUES
    -- MCC Departments
    ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Roads & Infrastructure', 'MCC_ROADS', 'Road maintenance, potholes, and civic footpaths', true),
    ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Solid Waste Management', 'MCC_SWM', 'Garbage collection, dumpsite clearing, and segregation', true),
    ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Public Health & Sanitation', 'MCC_HEALTH', 'Vector control, public toilets, and sanitation inspections', true),
    ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Street Lighting', 'MCC_LIGHTING', 'Streetlight outages and electrical maintenance', true),
    ('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Storm Water Drainage', 'MCC_DRAINAGE', 'Underground drainage and monsoon storm water management', true),
    -- MUDA Departments
    ('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 'Town Planning & Layouts', 'MUDA_PLANNING', 'Layout zoning, layout handover, and setback approvals', true),
    ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002', 'Sector Maintenance', 'MUDA_MAINT', 'Maintenance of un-handed-over residential layouts', true)
ON CONFLICT (authority_id, code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 3. Jurisdiction Versions Seed (Active Baseline)
INSERT INTO jurisdiction_versions (id, version_code, version_number, effective_from, effective_to, status, source, notes)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'MYS_2026_V1', 1, '2026-01-01 00:00:00+00', NULL, 'ACTIVE', 'HackMysuru Prototype Baseline', 'Initial demonstration jurisdiction baseline for central and peripheral Mysuru zones')
ON CONFLICT (version_code) DO UPDATE
SET status = 'ACTIVE';

-- 4. Demonstration Polygons around Mysuru
-- Polygon 1: Central Mysuru Municipal Zone (MCC)
-- Longitude: 76.6200 to 76.6600, Latitude: 12.2800 to 12.3200
INSERT INTO jurisdictions (id, jurisdiction_version_id, authority_id, name, code, boundary)
VALUES (
    ('e0000000-0000-0000-0000-000000000001'),
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'MCC Central Zone 1 (DEMO)',
    'MCC_ZONE_1',
    ST_Multi(ST_GeomFromText('POLYGON((76.6200 12.2800, 76.6600 12.2800, 76.6600 12.3200, 76.6200 12.3200, 76.6200 12.2800))', 4326))
)
ON CONFLICT (jurisdiction_version_id, code) DO UPDATE
SET name = EXCLUDED.name, boundary = EXCLUDED.boundary;

-- Polygon 2: Northwest Development Sector (MUDA)
-- Longitude: 76.5800 to 76.6150, Latitude: 12.3250 to 12.3650
INSERT INTO jurisdictions (id, jurisdiction_version_id, authority_id, name, code, boundary)
VALUES (
    ('e0000000-0000-0000-0000-000000000002'),
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'MUDA Northwest Sector (DEMO)',
    'MUDA_SECTOR_NW',
    ST_Multi(ST_GeomFromText('POLYGON((76.5800 12.3250, 76.6150 12.3250, 76.6150 12.3650, 76.5800 12.3650, 76.5800 12.3250))', 4326))
)
ON CONFLICT (jurisdiction_version_id, code) DO UPDATE
SET name = EXCLUDED.name, boundary = EXCLUDED.boundary;
