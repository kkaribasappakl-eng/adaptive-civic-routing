import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Shield, 
  Lock, 
  Mail, 
  User, 
  Phone, 
  LogIn, 
  UserPlus, 
  X, 
  CheckCircle2, 
  AlertTriangle,
  Zap,
  KeyRound,
  ShieldAlert
} from 'lucide-react';

const AuthModal = () => {
  const { 
    authModalOpen, 
    authModalConfig, 
    closeAuthModal, 
    login, 
    demoLogin, 
    register 
  } = useAuth();

  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register' | 'demo'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    if (authModalConfig?.defaultTab) {
      setActiveTab(authModalConfig.defaultTab);
    }
    setError(null);
    setSuccessMessage(null);
  }, [authModalConfig, authModalOpen]);

  if (!authModalOpen) return null;

  const handleManualLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }
    setLoading(true);
    setError(null);

    const res = await login(email, password);
    setLoading(false);
    if (res.success) {
      setSuccessMessage(`Authenticated as ${res.user.fullName} (${res.user.role})`);
      setTimeout(() => {
        closeAuthModal();
      }, 700);
    } else {
      setError(res.error || 'Authentication failed. Please check your credentials.');
    }
  };

  const handleDemoLogin = async (role) => {
    setLoading(true);
    setError(null);

    const res = await demoLogin(role);
    setLoading(false);
    if (res.success) {
      setSuccessMessage(`Demo session initiated as ${res.user.role}`);
      setTimeout(() => {
        closeAuthModal();
      }, 700);
    } else {
      setError(res.error || 'Demo login failed');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      setError('Full name, email, and password are required.');
      return;
    }
    setLoading(true);
    setError(null);

    const res = await register(fullName, email, password, phoneNumber);
    setLoading(false);
    if (res.success) {
      setSuccessMessage(`Citizen account created for ${res.user.fullName}`);
      setTimeout(() => {
        closeAuthModal();
      }, 700);
    } else {
      setError(res.error || 'Registration failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
      <div 
        className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/70 shadow-2xl overflow-hidden transition-all text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Banner */}
        <div className="h-2 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Civic Access Control
              </h2>
              <p className="text-xs text-slate-400">Adaptive Civic Routing Intelligence System</p>
            </div>
          </div>
          <button
            onClick={closeAuthModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Notice / Redirect Context */}
        {authModalConfig?.message && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span>{authModalConfig.message}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex px-6 pt-4 border-b border-slate-800/80 gap-4">
          <button
            type="button"
            onClick={() => { setActiveTab('demo'); setError(null); }}
            className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'demo'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Demo Accounts
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('login'); setError(null); }}
            className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'login'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('register'); setError(null); }}
            className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'register'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Register Citizen
          </button>
        </div>

        {/* Status Alerts */}
        <div className="px-6 pt-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
          {successMessage && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Tab 1: Demo Accounts (Backend-controlled, zero frontend passwords) */}
        {activeTab === 'demo' && (
          <div className="p-6 space-y-3">
            <p className="text-xs text-slate-400 mb-2">
              Select a pre-configured role to immediately test routing, reviews, analytics, and jurisdiction management without entering credentials:
            </p>

            {/* Operator Demo */}
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDemoLogin('OPERATOR')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:border-blue-500/50 transition group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  🛡️
                </div>
                <div>
                  <div className="text-sm font-semibold text-white group-hover:text-blue-400 transition">
                    Operator Demo
                  </div>
                  <div className="text-xs text-slate-400">
                    MCC Routing Authority & Human Review
                  </div>
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40">
                OPERATOR
              </span>
            </button>

            {/* Admin Demo */}
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDemoLogin('ADMIN')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:border-purple-500/50 transition group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                  👑
                </div>
                <div>
                  <div className="text-sm font-semibold text-white group-hover:text-purple-400 transition">
                    Admin Demo
                  </div>
                  <div className="text-xs text-slate-400">
                    Jurisdiction Activation & User Provisioning
                  </div>
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-700/40">
                ADMIN
              </span>
            </button>

            {/* Citizen Demo */}
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDemoLogin('CITIZEN')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/50 transition group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  👤
                </div>
                <div>
                  <div className="text-sm font-semibold text-white group-hover:text-emerald-400 transition">
                    Citizen Demo
                  </div>
                  <div className="text-xs text-slate-400">
                    Public Intake, Status Tracking & SLA Timeline
                  </div>
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                CITIZEN
              </span>
            </button>

            <div className="pt-2 text-[11px] text-slate-500 text-center flex items-center justify-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Zero credentials exposed in frontend bundle (backend-controlled session)</span>
            </div>
          </div>
        )}

        {/* Tab 2: Manual Login */}
        {activeTab === 'login' && (
          <form onSubmit={handleManualLogin} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. operator@hackmysuru.gov.in"
                  className="w-full pl-9 pr-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 font-semibold text-sm text-white transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* Tab 3: Citizen Registration */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className="p-6 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nayana K L"
                  className="w-full pl-9 pr-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="citizen@mysuru.gov.in"
                  className="w-full pl-9 pr-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Mobile Number (Optional)
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="9876543210"
                  className="w-full pl-9 pr-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="•••••••• (min 6 characters)"
                  className="w-full pl-9 pr-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  required
                />
              </div>
            </div>

            <div className="text-[11px] text-slate-400 bg-slate-800/50 p-2.5 rounded border border-slate-800">
              ℹ️ Public registration automatically provisions a <strong>CITIZEN</strong> role. Privileged Operator and Admin roles are provisioned by MCC Administrators.
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 font-semibold text-sm text-white transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              {loading ? 'Registering...' : 'Register Citizen Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
