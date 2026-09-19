-- Migration: 011_user_authentication.sql
-- Description: User accounts, authentication credentials, RBAC roles, and provisioning audit
-- Stage: Stage 12 — Authentication, Authorization & Role-Based Access Control

--------------------------------------------------------------------------------
-- 1. Create Users Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('CITIZEN', 'OPERATOR', 'ADMIN')),
    is_active BOOLEAN DEFAULT TRUE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

--------------------------------------------------------------------------------
-- 2. Create Indexes
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by_user_id);

--------------------------------------------------------------------------------
-- 3. Seed Verified Initial DEMO Accounts (HackMysuru Prototype)
--------------------------------------------------------------------------------
INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES 
    (
        'Mysuru System Administrator (DEMO)',
        'admin@hackmysuru.gov.in',
        '$2b$10$joabzGkG.feyMqVqFLYsJeXwU97wvWnK.711z/goc1Q4YRD.oyFMm',
        'ADMIN',
        TRUE
    ),
    (
        'Mysuru Civic Routing Operator (DEMO)',
        'operator@hackmysuru.gov.in',
        '$2b$10$0ytiEzPHbdGW0wEEC/4qk.DFt8fdw2BHjOVOW7JPCunyyyr4FWSMC',
        'OPERATOR',
        TRUE
    ),
    (
        'Mysuru Citizen User (DEMO)',
        'citizen@hackmysuru.gov.in',
        '$2b$10$EjpvTqlWmk5taOxsji4/BOtavR0s.pA/Bklmyb3yUbbUZIt4iA7q.',
        'CITIZEN',
        TRUE
    )
ON CONFLICT (email) DO UPDATE SET
    role = EXCLUDED.role,
    password_hash = EXCLUDED.password_hash,
    is_active = TRUE;
