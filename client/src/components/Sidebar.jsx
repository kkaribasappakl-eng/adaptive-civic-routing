import React from 'react';
import {
  LayoutDashboard,
  Send,
  Compass,
  UserCheck,
  Layers,
  BarChart3,
  ShieldCheck,
  Activity,
  Radio,
  Lock,
  Database
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({
  activeTab,
  onTabChange,
  socketConnected,
  apiHealthy,
  activeVersionCode = 'MYS_2026_V1',
  isOpen,
  onClose
}) {
  const { isOperator } = useAuth();

  const NAV_ITEMS = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'Operations Overview',
      restricted: false
    },
    {
      id: 'complaints',
      label: 'Citizen Portal',
      icon: Send,
      description: 'Submit & Track Cases',
      restricted: false
    },
    {
      id: 'routing',
      label: 'Routing Engine',
      icon: Compass,
      description: 'PostGIS Containment',
      restricted: !isOperator
    },
    {
      id: 'review',
      label: 'Operator Review',
      icon: UserCheck,
      description: 'Human-in-the-Loop',
      restricted: !isOperator
    },
    {
      id: 'jurisdictions',
      label: 'Jurisdictions',
      icon: Layers,
      description: 'Boundary Versions V1/V2',
      restricted: !isOperator
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      description: 'Operational Intelligence',
      restricted: !isOperator
    },
    {
      id: 'audit',
      label: 'Audit Trail',
      icon: ShieldCheck,
      description: 'Immutable Ledger',
      restricted: !isOperator
    }
  ];

  const handleNavClick = (tabId) => {
    onTabChange(tabId);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen w-64 bg-[#080d1a] border-r border-slate-800/80 z-50 flex flex-col justify-between transition-transform duration-200 ease-in-out select-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top: Logo & System Header */}
        <div>
          <div className="p-4 border-b border-slate-800/80 bg-[#060a14]/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/10 border border-teal-500/40 flex items-center justify-center text-teal-400 shadow-lg shadow-teal-950/40 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold tracking-tight text-white leading-tight truncate">
                  Adaptive Civic Routing
                </h1>
                <p className="text-[11px] font-mono text-teal-400 font-semibold tracking-wider uppercase mt-0.5">
                  Intelligence System
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                  <span className="text-[10px] text-slate-400 font-mono">Mysuru Operations</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-2.5 space-y-1 overflow-y-auto max-h-[calc(100vh-280px)]">
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
              Civic Modules
            </div>

            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group relative ${
                    isActive
                      ? 'bg-gradient-to-r from-teal-500/20 via-teal-500/10 to-transparent text-teal-200 border-l-[3px] border-teal-400 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    />
                    <div className="text-left truncate">
                      <span className={`block font-semibold ${isActive ? 'text-white' : ''}`}>
                        {item.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {item.restricted && (
                      <span className="text-[10px] text-slate-500 group-hover:text-amber-400/80" title="Privileged Access Required">
                        <Lock className="w-3 h-3" />
                      </span>
                    )}
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Telemetry Only */}
        <div className="p-3 border-t border-slate-800/80 bg-[#060a14]/80">
          {/* System Telemetry Pills */}
          <div className="bg-[#0d1424] rounded-xl p-2.5 border border-slate-800/80 space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-cyan-400" />
                API Service
              </span>
              <span className={`flex items-center gap-1 font-semibold ${apiHealthy ? 'text-emerald-400' : 'text-rose-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${apiHealthy ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                {apiHealthy ? 'LIVE' : 'DOWN'}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-teal-400" />
                WebSocket
              </span>
              <span className={`flex items-center gap-1 font-semibold ${socketConnected ? 'text-teal-400' : 'text-amber-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-teal-400 animate-pulse' : 'bg-amber-400'}`} />
                {socketConnected ? 'LIVE' : 'DISC'}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800">
              <span className="flex items-center gap-1.5">
                <Database className="w-3 h-3 text-indigo-400" />
                Bound Version
              </span>
              <span className="text-teal-300 font-bold truncate max-w-[80px]">
                {activeVersionCode}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
