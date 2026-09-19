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
    <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-6 py-3.5 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Branding */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Adaptive Civic Routing Intelligence System
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Stage 12 RBAC
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              HackMysuru • Role-Based Access Control & Spatial Routing Intelligence
            </p>
          </div>
        </div>

        {/* Center/Right: Navigation Tabs, Notifications & Auth State */}
        <div className="flex flex-wrap items-center gap-2.5">
          <nav className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => onTabChange && onTabChange('complaints')}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                activeTab === 'complaints'
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Citizen Portal
            </button>
            <button
              onClick={() => onTabChange && onTabChange('routing')}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                activeTab === 'routing'
                  ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Routing Engine
            </button>
            <button
              onClick={() => onTabChange && onTabChange('review')}
              className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1 ${
                activeTab === 'review'
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Operator Review</span>
              {!isOperator && <span className="text-[10px] text-amber-500">🔒</span>}
            </button>
            <button
              onClick={() => onTabChange && onTabChange('jurisdictions')}
              className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1 ${
                activeTab === 'jurisdictions'
                  ? 'bg-civic-600/30 text-civic-300 border border-civic-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Jurisdictions</span>
              {!isOperator && <span className="text-[10px] text-slate-500">🔒</span>}
            </button>
            <button
              onClick={() => onTabChange && onTabChange('analytics')}
              className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1 ${
                activeTab === 'analytics'
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Analytics</span>
              {!isOperator && <span className="text-[10px] text-purple-400">🔒</span>}
            </button>
          </nav>

          {/* Stage 8: Real-Time Notification Center */}
          <NotificationCenter onSelectComplaint={onSelectComplaint} />

          {/* Stage 12: User Authentication Pill & Quick Demo Actions */}
          <div className="flex items-center gap-2 pl-1 border-l border-slate-800">
            {isAuthenticated ? (
              <div className="flex items-center gap-2 bg-slate-950/70 py-1 px-2.5 rounded-lg border border-slate-800">
                {getRoleBadge()}
                <span className="text-xs text-slate-200 max-w-[120px] truncate font-medium">
                  {user.fullName.split(' ')[0]}
                </span>
                <button
                  onClick={logout}
                  title="Sign out of current session"
                  className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openAuthModal({ defaultTab: 'demo' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold transition shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Demo Login</span>
                </button>
                <button
                  onClick={() => openAuthModal({ defaultTab: 'login' })}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition"
                  title="Manual Sign In"
                >
                  <LogIn className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Real-time connection indicators */}
          <div className="hidden xl:flex items-center gap-1.5 text-xs font-mono">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${
              apiHealthy 
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400' 
                : 'bg-rose-950/40 border-rose-500/30 text-rose-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${apiHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="text-[10px]">API</span>
            </div>

            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${
              socketConnected 
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400' 
                : 'bg-amber-950/40 border-amber-500/30 text-amber-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[10px]">WS</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
