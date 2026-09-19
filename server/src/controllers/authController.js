const authService = require('../services/authService');
const auditService = require('../services/auditService');
const { resetRateLimiter } = require('../middleware/authMiddleware');

const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = process.env.COOKIE_SAME_SITE || (isProd ? 'none' : 'lax');
  const secure = process.env.COOKIE_SECURE !== undefined 
    ? process.env.COOKIE_SECURE === 'true' 
    : (isProd || sameSite === 'none');

  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  };
};

const setAuthCookie = (res, token) => {
  res.cookie('token', token, getCookieOptions());
};

/**
 * Public Citizen Registration
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { fullName, email, password, phone } = req.body;
    const { user, token } = await authService.registerCitizen({ fullName, email, password, phone });

    setAuthCookie(res, token);

    // Audit successful citizen registration
    await auditService.logAuditEvent({
      actorUserId: user.id,
      actorRole: 'CITIZEN',
      action: 'AUTH_REGISTER',
      entityType: 'USER',
      entityId: user.id,
      result: 'SUCCESS',
      metadata: { email: user.email, role: user.role },
      request: req
    });

    res.status(201).json({
      success: true,
      message: 'Citizen account registered successfully.',
      data: { user, token }
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
};

/**
 * Standard User Login
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  const { email } = req.body;
  try {
    const { password } = req.body;
    const { user, token } = await authService.login({ email, password });

    setAuthCookie(res, token);

    // Audit successful login
    await auditService.logAuditEvent({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      entityType: 'USER',
      entityId: user.id,
      result: 'SUCCESS',
      metadata: { email: user.email, role: user.role },
      request: req
    });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: { user, token }
    });
  } catch (error) {
    // Audit failed login (Record email only, NEVER password!)
    await auditService.logAuditEvent({
      actorUserId: null,
      actorRole: 'ANONYMOUS',
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'USER',
      entityId: email || 'unknown',
      result: 'FAILURE',
      reason: error.message || 'Invalid credentials',
      metadata: { attemptedEmail: email },
      request: req
    });

    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
};

/**
 * Demo Login (Backend-controlled demonstration authentication)
 * POST /api/auth/demo-login
 * Keeps frontend clean of demo credentials.
 */
const demoLogin = async (req, res, next) => {
  try {
    const { role } = req.body;
    const { user, token } = await authService.demoLogin(role);

    setAuthCookie(res, token);
    resetRateLimiter(req.ip || req.socket?.remoteAddress);

    // Audit demo login
    await auditService.logAuditEvent({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      entityType: 'USER',
      entityId: user.id,
      result: 'SUCCESS',
      metadata: { demoRole: role, email: user.email, isDemo: true },
      request: req
    });

    res.status(200).json({
      success: true,
      message: `Demo login successful as ${user.role}.`,
      data: { user, token }
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
};

/**
 * Get Authenticated User Profile
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const user = await authService.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User Logout
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  // Audit logout event
  await auditService.logAuditEvent({
    actorUserId: req.user?.id || null,
    actorRole: req.user?.role || 'ANONYMOUS',
    action: 'AUTH_LOGOUT',
    entityType: 'USER',
    entityId: req.user?.id || null,
    result: 'SUCCESS',
    request: req
  });

  const cookieOpts = getCookieOptions();
  res.clearCookie('token', {
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite
  });
  res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
};

/**
 * Admin-Only User Provisioning
 * POST /api/auth/users
 */
const provisionUser = async (req, res, next) => {
  try {
    const { fullName, email, password, role } = req.body;
    const newUser = await authService.provisionUserByAdmin(
      { fullName, email, password, role },
      req.user.id
    );

    // Audit user provisioning with admin actor id
    await auditService.logAuditEvent({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'AUTH_USER_PROVISIONED',
      entityType: 'USER',
      entityId: newUser.id,
      result: 'SUCCESS',
      metadata: {
        provisionedEmail: newUser.email,
        provisionedRole: newUser.role,
        provisionedByAdminId: req.user.id
      },
      request: req
    });

    res.status(201).json({
      success: true,
      message: `User account '${newUser.email}' provisioned with role '${newUser.role}'.`,
      data: { user: newUser }
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
};

module.exports = {
  register,
  login,
  demoLogin,
  getMe,
  logout,
  provisionUser,
  getCookieOptions
};
