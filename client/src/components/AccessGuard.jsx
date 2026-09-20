import React from 'react';
import { Shield, Lock, ShieldAlert, Sparkles, LogIn, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AccessGuard({ 
  requiredRole = 'OPERATOR', 
  tabTitle = 'Privileged Area',
  onBackToPublic
}) {
  const { role, isAuthenticated, demoLogin, openAuthModal } = useAuth();

  return (
    <div className="max-w-2xl mx-auto my-12 p-8 rounded-3xl bg-[#0d1424]/95 border border-slate-800/90 shadow-2xl backdrop-blur text-center animate-fade-in">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-5 text-amber-400">
        <Lock className="w-8 h-8" />
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-white tracking-tight mb-2">
        Access Restricted: {tabTitle}
      </h2>

      {/* Description */}
      <p className="text-sm text-slate-300 max-w-lg mx-auto mb-6 leading-relaxed">
        {isAuthenticated ? (
          <>
            Your current session role is <strong className="text-emerald-400">{role}</strong>. 
            This workspace requires privileged <strong className="text-amber-400">{requiredRole}</strong> or <strong className="text-purple-400">ADMIN</strong> credentials under Mysuru Civic Governance policies.
          </>
        ) : (
          <>
            This workspace is restricted to authenticated <strong>MCC Operators</strong> and <strong>Administrators</strong>. 
            Public users may submit and track complaints on the Citizen Portal.
          </>
        )}
      </p>

      {/* Quick Demo Login Options (Backend controlled, no passwords in bundle) */}
      <div className="bg-[#0a0f1e]/80 border border-slate-800/80 rounded-2xl p-5 mb-6 text-left">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span>Quick Demo Access (1-Click Switch)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => demoLogin('OPERATOR')}
            className="flex items-center justify-between p-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-sm font-semibold transition group"
          >
            <div className="flex items-center gap-2">
              <span>🛡️</span>
              <span>Operator Demo</span>
            </div>
            <span className="text-[11px] opacity-75 font-mono">OPERATOR</span>
          </button>

          <button
            type="button"
            onClick={() => demoLogin('ADMIN')}
            className="flex items-center justify-between p-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-sm font-semibold transition group"
          >
            <div className="flex items-center gap-2">
              <span>👑</span>
              <span>Admin Demo</span>
            </div>
            <span className="text-[11px] opacity-75 font-mono">ADMIN</span>
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => openAuthModal({ defaultTab: 'login' })}
          className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium transition flex items-center gap-2"
        >
          <LogIn className="w-4 h-4" />
          <span>Manual Sign In</span>
        </button>

        {onBackToPublic && (
          <button
            type="button"
            onClick={onBackToPublic}
            className="px-5 py-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-sm font-medium transition flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Citizen Portal</span>
          </button>
        )}
      </div>
    </div>
  );
}
