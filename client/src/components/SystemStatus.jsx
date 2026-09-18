import React from 'react';
import { Database, Radio, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Layers } from 'lucide-react';

export default function SystemStatus({
  apiHealth,
  socketConnected,
  socketDetails,
  loading,
  onRefresh
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-civic-400" />
            Foundation System Diagnostics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Stage 1 verification status across Backend API, Real-time Gateway, and Database Layer.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Backend API Status */}
        <div className="bg-slate-950/60 rounded-lg p-4 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-slate-400 uppercase">Express API</span>
              {apiHealth?.success ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-rose-400 font-medium">
                  <XCircle className="w-3.5 h-3.5" /> Offline
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-200">
              {apiHealth?.data?.message || (loading ? 'Checking...' : 'Service Unavailable')}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
            Endpoint: <span className="text-civic-400">GET /api/health</span>
          </div>
        </div>

        {/* Real-time Socket.IO Status */}
        <div className="bg-slate-950/60 rounded-lg p-4 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-slate-400 uppercase">Socket.IO Gateway</span>
              {socketConnected ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" /> Connecting
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-200">
              {socketConnected 
                ? `Active Session: ${socketDetails?.socketId ? socketDetails.socketId.substring(0, 12) + '...' : 'Live'}`
                : 'Awaiting connection'}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
            Protocol: <span className="text-civic-400">WebSocket / Polling Fallback</span>
          </div>
        </div>

        {/* PostgreSQL / PostGIS Status */}
        <div className="bg-slate-950/60 rounded-lg p-4 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-slate-400 uppercase">PostgreSQL / PostGIS</span>
              {apiHealth?.data?.database?.connected ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" /> Standalone Config
                </span>
              )}
            </div>
            <p className="text-xs font-normal text-slate-300 line-clamp-2">
              {apiHealth?.data?.database?.message || 'Configured via pg pool (graceful mode)'}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
            PostGIS Extension: <span className={apiHealth?.data?.database?.postgisInstalled ? "text-emerald-400" : "text-slate-400"}>
              {apiHealth?.data?.database?.postgisInstalled ? 'Installed' : 'Ready for Stage 3'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
