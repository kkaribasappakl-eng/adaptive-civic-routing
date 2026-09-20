import React from 'react';
import { ShieldCheck, MapPin, Activity, Terminal, Shield, LogIn, LogOut, User, KeyRound, Sparkles } from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import { useAuth } from '../context/AuthContext';

export default function Header({ socketConnected, apiHealthy, activeTab = 'complaints', onTabChange, onSelectComplaint }) {
  const { user, role, isAuthenticated, isOperator, isAdmin, logout, openAuthModal } = useAuth();

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
            PUBLIC (ANONYMOUS)
          </span>
        );
    }
  };

  return (
    <header className="bg-[#0a0f1e]/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-3 sticky top-0 z-40 shadow-xl shadow-black/20">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left: Branding */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-indigo-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shadow-lg shadow-teal-950/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Adaptive Civic Routing Intelligence System
              <span className="text-[11px] uppercase font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/30 font-semibold tracking-wide">
                Stage 14 Production
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium flex items-center gap-2">
              <span>HackMysuru</span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span>Civic Operations Platform</span>
            </p>
          </div>
        </div>

        {/* Center/Right: Navigation Tabs, Notifications & Auth State */}
        <div className="flex flex-wrap items-center gap-2.5">
          <nav className="flex items-center gap-1 bg-[#060a14]/90 p-1 rounded-xl border border-slate-800/90 shadow-inner text-xs">
            <button
              onClick={() => onTabChange && onTabChange('complaints')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all duration-150 ${
                activeTab === 'complaints'
                  ? 'bg-gradient-to-r from-emerald-600/30 to-teal-600/30 text-teal-200 border border-teal-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Citizen Portal
            </button>
            <button
              onClick={() => onTabChange && onTabChange('routing')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all duration-150 flex items-center gap-1 ${
                activeTab === 'routing'
                  ? 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 text-cyan-200 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span>Routing Engine</span>
              {!isOperator && <span className="text-[10px] text-cyan-400">🔒</span>}
            </button>
            <button
              onClick={() => onTabChange && onTabChange('review')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all duration-150 flex items-center gap-1 ${
                activeTab === 'review'
                  ? 'bg-gradient-to-r from-amber-600/30 to-orange-600/30 text-amber-200 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span>Operator Review</span>
              {!isOperator && <span className="text-[10px] text-amber-500">🔒</span>}
            </button>
            <button
              onClick={() => onTabChange && onTabChange('jurisdictions')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all duration-150 flex items-center gap-1 ${
                activeTab === 'jurisdictions'
                  ? 'bg-gradient-to-r from-indigo-600/30 to-blue-600/30 text-indigo-200 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span>Jurisdictions</span>
              {!isOperator && <span className="text-[10px] text-slate-500">🔒</span>}
            </button>
            <button
              onClick={() => onTabChange && onTabChange('analytics')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all duration-150 flex items-center gap-1 ${
                activeTab === 'analytics'
                  ? 'bg-gradient-to-r from-purple-600/30 to-indigo-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span>Analytics</span>
              {!isOperator && <span className="text-[10px] text-purple-400">🔒</span>}
            </button>
            <button
              onClick={() => onTabChange && onTabChange('audit')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all duration-150 flex items-center gap-1 ${
                activeTab === 'audit'
                  ? 'bg-gradient-to-r from-amber-600/30 to-teal-600/30 text-amber-200 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span>Audit Trail</span>
              {!isOperator && <span className="text-[10px] text-amber-400">🔒</span>}
            </button>
          </nav>

          {/* Stage 8: Real-Time Notification Center */}
          <NotificationCenter onSelectComplaint={onSelectComplaint} />

          {/* Stage 12: User Authentication Pill & Quick Demo Actions */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800/80">
            {isAuthenticated ? (
              <div className="flex items-center gap-2 bg-[#060a14]/80 py-1 px-2.5 rounded-xl border border-slate-800/80 shadow-inner">
                {getRoleBadge()}
                <span className="text-xs text-slate-200 max-w-[120px] truncate font-semibold">
                  {user.fullName.split(' ')[0]}
                </span>
                <button
                  onClick={logout}
                  title="Sign out of current session"
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openAuthModal({ defaultTab: 'demo' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 border border-blue-500/40 text-blue-200 text-xs font-semibold transition shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Demo Login</span>
                </button>
                <button
                  onClick={() => openAuthModal({ defaultTab: 'login' })}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800/80 transition"
                  title="Manual Sign In"
                >
                  <LogIn className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Real-time connection indicators */}
          <div className="hidden xl:flex items-center gap-1.5 text-xs font-mono">
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border ${
              apiHealthy 
                ? 'bg-teal-950/40 border-teal-500/30 text-teal-300' 
                : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${apiHealthy ? 'bg-teal-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="text-[10px] font-semibold">API</span>
            </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border ${
              socketConnected 
                ? 'bg-teal-950/40 border-teal-500/30 text-teal-300' 
                : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-teal-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[10px] font-semibold">WS</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

