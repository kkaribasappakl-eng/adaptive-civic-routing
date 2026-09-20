-- Migration: 013_user_phone.sql
-- Description: Add phone column to users table for authenticated citizen contact consistency
-- Stage: Final Phone Contact Consistency

--------------------------------------------------------------------------------
-- 1. Add phone column to users table
--------------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

--------------------------------------------------------------------------------
-- 2. Create index on phone for fast lookup and contact consistency
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

--------------------------------------------------------------------------------
-- 3. Seed demo citizen account with standard Mysore demo phone
--------------------------------------------------------------------------------
UPDATE users 
SET phone = '+919845012345' 
WHERE email = 'citizen@hackmysuru.gov.in' AND (phone IS NULL OR phone = '');
