import React from 'react';
import { ShieldCheck, MapPin, Activity, Terminal } from 'lucide-react';

export default function Header({ socketConnected, apiHealthy }) {
  return (
    <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 py-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Branding */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-civic-600/20 border border-civic-500/30 flex items-center justify-center text-civic-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Adaptive Civic Routing Intelligence System
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Stage 3
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              HackMysuru • Adaptive Civic Routing
            </p>
          </div>
        </div>

        {/* Center/Right: Navigation Placeholder & Real-Time Indicators */}
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800 text-xs">
            <span className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-300 font-medium border border-slate-700">
              GIS Foundation
            </span>
            <span className="px-3 py-1.5 rounded-md bg-civic-600/30 text-civic-300 font-semibold border border-civic-500/30">
              Jurisdictions (Stage 3)
            </span>
            <span className="px-3 py-1.5 text-slate-500 cursor-not-allowed" title="Available in Stage 4+">
              Routing Engine (Stage 4)
            </span>
          </nav>

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
