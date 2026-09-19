const authService = require('../services/authService');

const setAuthCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });
};

/**
 * Public Citizen Registration
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { fullName, email, password } = req.body;
    const { user, token } = await authService.registerCitizen({ fullName, email, password });

    setAuthCookie(res, token);

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
  try {
    const { email, password } = req.body;
    const { user, token } = await authService.login({ email, password });

    setAuthCookie(res, token);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
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
 * Demo Login (Backend-controlled demonstration authentication)
 * POST /api/auth/demo-login
 * Keeps frontend clean of demo credentials.
 */
const demoLogin = async (req, res, next) => {
  try {
    const { role } = req.body;
    const { user, token } = await authService.demoLogin(role);

    setAuthCookie(res, token);

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
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
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
  provisionUser
};
