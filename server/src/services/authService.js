const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES_IN = '24h';
const DEFAULT_DEV_SECRET = 'dev_stage_1_super_secret_jwt_key_12345';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_DEV_SECRET;

const isJwtSecretSecure = () => {
  return Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET !== DEFAULT_DEV_SECRET);
};

if (process.env.NODE_ENV === 'production' && !isJwtSecretSecure()) {
  console.warn('\n⚠️ [SECURITY WARNING] Server running in production mode with default/missing JWT_SECRET!');
  console.warn('⚠️ Set a secure random JWT_SECRET in server environment variables.\n');
}

const CONTROLLED_ROLES = ['CITIZEN', 'OPERATOR', 'ADMIN'];

/**
 * Hash plaintext password using bcrypt
 */
const hashPassword = async (plaintext) => {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Password must be a valid non-empty string.');
  }
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
};

/**
 * Compare plaintext password with stored bcrypt hash
 */
const comparePassword = async (plaintext, hash) => {
  if (!plaintext || !hash) return false;
  return bcrypt.compare(plaintext, hash);
};

/**
 * Generate cryptographically signed JWT with minimal identity claims
 * STRICT SECURITY: Only contains id, role, and email. Never contains password/hash.
 */
const generateToken = (user, expiresIn = JWT_EXPIRES_IN) => {
  const payload = {
    id: user.id,
    role: user.role,
    email: user.email
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

/**
 * Verify JWT signature and expiration
 */
const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

/**
 * Sanitize user object to never expose password_hash
 */
const sanitizeUser = (user) => {
  if (!user) return null;
  const { password_hash, ...sanitized } = user;
  return {
    id: sanitized.id,
    fullName: sanitized.full_name,
    email: sanitized.email,
    role: sanitized.role,
    isActive: sanitized.is_active,
    createdByUserId: sanitized.created_by_user_id || null,
    createdAt: sanitized.created_at,
    updatedAt: sanitized.updated_at,
    lastLoginAt: sanitized.last_login_at
  };
};

/**
 * Public Citizen Registration
 * STRICT SECURITY: Public registration ALWAYS sets role to 'CITIZEN'.
 * Any client-supplied role parameter is strictly rejected or overridden.
 */
const registerCitizen = async ({ fullName, email, password }) => {
  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    const err = new Error('Full name is required.');
    err.status = 400;
    throw err;
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    const err = new Error('Valid email address is required.');
    err.status = 400;
    throw err;
  }

  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    const err = new Error('Invalid email address format.');
    err.status = 400;
    throw err;
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    const err = new Error('Password must be at least 6 characters long.');
    err.status = 400;
    throw err;
  }

  // Check if email already registered
  const existing = await pool.query('SELECT id FROM users WHERE email = $1;', [cleanEmail]);
  if (existing.rows.length > 0) {
    const err = new Error('An account with this email already exists.');
    err.status = 409;
    throw err;
  }

  const passwordHash = await hashPassword(password);

  // Forced CITIZEN role
  const insertQuery = `
    INSERT INTO users (full_name, email, password_hash, role, is_active)
    VALUES ($1, $2, $3, 'CITIZEN', TRUE)
    RETURNING id, full_name, email, role, is_active, created_at, updated_at, last_login_at;
  `;

  const res = await pool.query(insertQuery, [fullName.trim(), cleanEmail, passwordHash]);
  const user = res.rows[0];
  const token = generateToken(user);

  return {
    user: sanitizeUser(user),
    token
  };
};

/**
 * Standard User Login
 * Generic error response prevents account enumeration.
 */
const login = async ({ email, password }) => {
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    const err = new Error('Email and password are required.');
    err.status = 400;
    throw err;
  }

  const cleanEmail = email.trim().toLowerCase();

  const userRes = await pool.query(
    'SELECT id, full_name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE email = $1;',
    [cleanEmail]
  );

  // Use generic error if user not found
  if (userRes.rows.length === 0) {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    throw err;
  }

  const user = userRes.rows[0];

  // Deactivated user check
  if (!user.is_active) {
    const err = new Error('Account is deactivated. Contact system administrator.');
    err.status = 403;
    throw err;
  }

  // Verify password with bcrypt
  const validPassword = await comparePassword(password, user.password_hash);
  if (!validPassword) {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    throw err;
  }

  // Update last_login_at
  await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1;', [user.id]);
  user.last_login_at = new Date();

  const token = generateToken(user);

  return {
    user: sanitizeUser(user),
    token
  };
};

/**
 * Demo Login (Backend-controlled demonstration authentication)
 * Allows 1-click login for HackMysuru evaluation WITHOUT exposing passwords in frontend bundle.
 */
const demoLogin = async (role) => {
  const targetRole = (role || '').trim().toUpperCase();
  if (!CONTROLLED_ROLES.includes(targetRole)) {
    const err = new Error(`Invalid demo role '${role}'. Must be CITIZEN, OPERATOR, or ADMIN.`);
    err.status = 400;
    throw err;
  }

  // Find the seeded demo account for this role
  const userRes = await pool.query(
    'SELECT id, full_name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE role = $1 AND is_active = TRUE ORDER BY created_at ASC LIMIT 1;',
    [targetRole]
  );

  if (userRes.rows.length === 0) {
    const err = new Error(`No active demo account found for role '${targetRole}'.`);
    err.status = 404;
    throw err;
  }

  const user = userRes.rows[0];

  await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1;', [user.id]);
  user.last_login_at = new Date();

  const token = generateToken(user);

  return {
    user: sanitizeUser(user),
    token
  };
};

/**
 * Admin-Authorized User Provisioning
 * Only authenticated ADMIN users can provision OPERATOR or ADMIN accounts.
 * Records created_by_user_id for auditability.
 */
const provisionUserByAdmin = async ({ fullName, email, password, role }, adminUserId) => {
  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    const err = new Error('Full name is required.');
    err.status = 400;
    throw err;
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    const err = new Error('Email is required.');
    err.status = 400;
    throw err;
  }

  const cleanEmail = email.trim().toLowerCase();
  const targetRole = (role || 'CITIZEN').trim().toUpperCase();

  if (!CONTROLLED_ROLES.includes(targetRole)) {
    const err = new Error(`Invalid role '${role}'. Must be CITIZEN, OPERATOR, or ADMIN.`);
    err.status = 400;
    throw err;
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    const err = new Error('Password must be at least 6 characters long.');
    err.status = 400;
    throw err;
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1;', [cleanEmail]);
  if (existing.rows.length > 0) {
    const err = new Error('An account with this email already exists.');
    err.status = 409;
    throw err;
  }

  const passwordHash = await hashPassword(password);

  const insertQuery = `
    INSERT INTO users (full_name, email, password_hash, role, is_active, created_by_user_id)
    VALUES ($1, $2, $3, $4, TRUE, $5)
    RETURNING id, full_name, email, role, is_active, created_by_user_id, created_at, updated_at, last_login_at;
  `;

  const res = await pool.query(insertQuery, [fullName.trim(), cleanEmail, passwordHash, targetRole, adminUserId]);
  return sanitizeUser(res.rows[0]);
};

/**
 * Get sanitized user by ID
 */
const getUserById = async (userId) => {
  const res = await pool.query(
    'SELECT id, full_name, email, role, is_active, created_by_user_id, created_at, updated_at, last_login_at FROM users WHERE id = $1;',
    [userId]
  );
  if (res.rows.length === 0) return null;
  return sanitizeUser(res.rows[0]);
};

module.exports = {
  CONTROLLED_ROLES,
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  sanitizeUser,
  registerCitizen,
  login,
  demoLogin,
  provisionUserByAdmin,
  getUserById,
  DEFAULT_DEV_SECRET,
  isJwtSecretSecure
};
