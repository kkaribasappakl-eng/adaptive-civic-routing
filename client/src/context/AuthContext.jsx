import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getCurrentUser, loginUser, demoLoginUser, registerUser, logoutUser } from '../services/api';
import { socket } from '../services/socket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState({ defaultTab: 'login', redirectTarget: null, message: null });

  // Refresh socket connection on auth change
  const refreshSocket = useCallback(() => {
    try {
      if (socket.connected) {
        socket.disconnect();
      }
      socket.connect();
    } catch (e) {
      console.warn('Socket refresh warning:', e);
    }
  }, []);

  // Initial session check on mount
  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      try {
        const res = await getCurrentUser();
        if (mounted && res.success && res.data) {
          setUser(res.data);
        } else if (mounted) {
          setUser(null);
        }
      } catch (err) {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    checkSession();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email, password) => {
    const res = await loginUser(email, password);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      refreshSocket();
      return { success: true, user: res.data.user };
    }
    return { success: false, error: res.error || 'Login failed' };
  };

  const demoLogin = async (role) => {
    const res = await demoLoginUser(role);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      refreshSocket();
      return { success: true, user: res.data.user };
    }
    return { success: false, error: res.error || 'Demo login failed' };
  };

  const register = async (fullName, email, password, phone) => {
    const res = await registerUser(fullName, email, password, phone);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      refreshSocket();
      return { success: true, user: res.data.user };
    }
    return { success: false, error: res.error || 'Registration failed' };
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    refreshSocket();
  };

  const openAuthModal = (options = {}) => {
    setAuthModalConfig({
      defaultTab: options.defaultTab || 'login',
      redirectTarget: options.redirectTarget || null,
      message: options.message || null
    });
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
    setAuthModalConfig({ defaultTab: 'login', redirectTarget: null, message: null });
  };

  const value = {
    user,
    role: user?.role || 'ANONYMOUS',
    isAuthenticated: !!user,
    isOperator: user?.role === 'OPERATOR' || user?.role === 'ADMIN',
    isAdmin: user?.role === 'ADMIN',
    isCitizen: user?.role === 'CITIZEN',
    loading,
    login,
    demoLogin,
    register,
    logout,
    authModalOpen,
    authModalConfig,
    openAuthModal,
    closeAuthModal
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
