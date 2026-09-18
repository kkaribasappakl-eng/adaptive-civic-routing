-- Migration: 001_init_postgis_foundation.sql
-- Description: Enable PostGIS extensions and baseline schema foundation (Stage 1 preparation)

-- Enable spatial extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Health check table / metadata table
CREATE TABLE IF NOT EXISTS system_metadata (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_metadata (key, value)
VALUES ('system_name', 'Adaptive Civic Routing Intelligence System'),
       ('current_stage', '1'),
       ('city', 'Mysuru')
ON CONFLICT (key) DO NOTHING;
