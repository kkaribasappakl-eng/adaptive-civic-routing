import React from 'react';
import { ShieldCheck, MapPin, Activity, Terminal } from 'lucide-react';
import NotificationCenter from './NotificationCenter';

export default function Header({ socketConnected, apiHealthy, activeTab = 'complaints', onTabChange, onSelectComplaint }) {
  return (
    <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 py-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Branding */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Adaptive Civic Routing Intelligence System
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-civic-500/10 text-civic-400 border border-civic-500/20">
                Stage 11
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              HackMysuru • Operational Analytics & Routing Intelligence
            </p>
          </div>
        </div>

        {/* Center/Right: Navigation Tabs, Notifications & Real-Time Indicators */}
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => onTabChange && onTabChange('complaints')}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                activeTab === 'complaints'
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Citizen Portal (Stage 4)
            </button>
            <button
              onClick={() => onTabChange && onTabChange('routing')}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                activeTab === 'routing'
                  ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Routing Engine (Stage 5)
            </button>
            <button
              onClick={() => onTabChange && onTabChange('review')}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                activeTab === 'review'
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Operator Review (Stage 9)
            </button>
            <button
              onClick={() => onTabChange && onTabChange('jurisdictions')}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                activeTab === 'jurisdictions'
                  ? 'bg-civic-600/30 text-civic-300 border border-civic-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Jurisdiction Manager (Stage 10)
            </button>
            <button
              onClick={() => onTabChange && onTabChange('analytics')}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                activeTab === 'analytics'
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Analytics Dashboard (Stage 11)
            </button>
          </nav>

          {/* Stage 8: Real-Time Notification Center */}
          <NotificationCenter onSelectComplaint={onSelectComplaint} />

          {/* Quick status pills */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
              apiHealthy 
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400' 
                : 'bg-rose-950/40 border-rose-500/30 text-rose-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${apiHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span>API {apiHealthy ? 'OK' : 'OFFLINE'}</span>
            </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
              socketConnected 
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400' 
                : 'bg-amber-950/40 border-amber-500/30 text-amber-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>WS {socketConnected ? 'CONNECTED' : 'CONNECTING'}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
