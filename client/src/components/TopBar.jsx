import React from 'react';
import {
  Menu,
  MapPin,
  Activity,
  Radio,
  ShieldCheck,
  Compass,
  Database,
  Layers,
  Sparkles,
  LogIn,
  LogOut
} from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import { useAuth } from '../context/AuthContext';

export default function TopBar({
  activeTab,
  onToggleSidebar,
  socketConnected,
  apiHealthy,
  activeVersionCode = 'MYS_2026_V1',
  onSelectComplaint
}) {
  const { user, role, isAuthenticated, isOperator, isAdmin, logout, openAuthModal, demoLogin } = useAuth();

  const getModuleTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Operations Dashboard';
      case 'complaints':
        return 'Citizen Intake & Case Tracking';
      case 'routing':
        return 'Deterministic Routing Engine';
      case 'review':
        return 'Operator Human Review Queue';
      case 'jurisdictions':
        return 'Jurisdiction Boundary Versioning';
      case 'analytics':
        return 'Civic Analytics & Intelligence';
      case 'audit':
        return 'Immutable Audit Ledger';
      default:
        return 'Civic Operations Console';
    }
  };

  const getRoleBadge = () => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            👑 ADMIN
          </span>
        );
      case 'OPERATOR':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            🛡️ OPERATOR
          </span>
        );
      case 'CITIZEN':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            👤 CITIZEN
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
            PUBLIC
          </span>
        );
    }
  };

  return (
    <header className="bg-[#0a0f1e]/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-2.5 sticky top-0 z-30 shadow-md">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Mobile Toggle & Breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="md:hidden p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
            aria-label="Toggle navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-teal-400 font-bold tracking-wider uppercase hidden sm:inline">
              MYSURU OPS
            </span>
            <span className="text-slate-600 hidden sm:inline">/</span>
            <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              {getModuleTitle()}
            </h2>
            <span className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-850 text-slate-400 border border-slate-700/80">
              <MapPin className="w-3 h-3 text-teal-400" />
              MCC & MUDA
            </span>
          </div>
        </div>

        {/* Right: Telemetry Badges, Notifications, Role, Auth */}
        <div className="flex items-center gap-2.5">
          {/* Status Badges */}
          <div className="hidden xl:flex items-center gap-2 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-850 text-slate-400 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${apiHealthy ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              API: {apiHealthy ? 'LIVE' : 'DOWN'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-850 text-slate-400 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-teal-400 animate-pulse' : 'bg-amber-400'}`} />
              WS: {socketConnected ? 'LIVE' : 'DISC'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-850 text-teal-300 font-bold">
              {activeVersionCode}
            </span>
          </div>

          {/* Citizen & Operator Notifications */}
          <NotificationCenter onSelectComplaint={onSelectComplaint} />

          {/* Role Badge */}
          {getRoleBadge()}

          {/* Quick Demo Switcher / Login */}
          {!isAuthenticated ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => demoLogin('OPERATOR')}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-semibold transition"
                title="Quick switch to MCC Operator demo"
              >
                <span>🛡️</span>
                <span>Demo Operator</span>
              </button>
              <button
                onClick={() => openAuthModal()}
                className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold text-xs transition"
              >
                Sign In
              </button>
            </div>
          ) : (
            <button
              onClick={logout}
              className="text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 transition border border-slate-750 font-medium"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
