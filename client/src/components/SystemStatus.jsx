import React from 'react';
import { Database, Radio, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Layers, Globe } from 'lucide-react';

export default function SystemStatus({
  dbStatus,
  socketConnected,
  socketDetails,
  loading,
  onRefresh
}) {
  const dbConnected = Boolean(dbStatus?.connected);
  const postgisAvailable = Boolean(dbStatus?.postgisInstalled);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-civic-400" />
            Stage 2 Database & GIS System Diagnostics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Live infrastructure status verified against PostgreSQL, PostGIS, OpenStreetMap, and WebSocket Gateway.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. PostgreSQL Database Status */}
        <div className="bg-slate-950/70 rounded-lg p-4 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">Database</span>
              {dbConnected ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-rose-400 font-medium">
                  <XCircle className="w-3.5 h-3.5" /> Offline
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-200">
              {dbConnected ? 'PostgreSQL Active' : 'PostgreSQL Offline'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              {dbStatus?.message || (loading ? 'Checking...' : 'Database service unreachable')}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
            Target: <span className="text-civic-400">{dbStatus?.databaseName || 'adaptive_civic_routing'}</span>
          </div>
        </div>

        {/* 2. PostGIS Extension Status */}
        <div className="bg-slate-950/70 rounded-lg p-4 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">PostGIS Extension</span>
              {postgisAvailable ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Available
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" /> Unavailable
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-200">
              {postgisAvailable ? 'Spatial Engine Ready' : 'Spatial Extension Missing'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {postgisAvailable ? `Version: ${dbStatus?.postgisVersion}` : 'Requires PostgreSQL + PostGIS'}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
            Queries: <span className={postgisAvailable ? "text-emerald-400" : "text-amber-400"}>
              {postgisAvailable ? 'ST_Covers Active' : 'Standby Mode'}
            </span>
          </div>
        </div>

        {/* 3. OpenStreetMap Status */}
        <div className="bg-slate-950/70 rounded-lg p-4 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">Map Tiles</span>
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Loaded
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-200">
              OpenStreetMap Connected
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Tile provider: osm.org (SRID 4326)
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
            Center: <span className="text-civic-400">Mysuru (12.2958° N, 76.6394° E)</span>
          </div>
        </div>

        {/* 4. Socket.IO Gateway */}
        <div className="bg-slate-950/70 rounded-lg p-4 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">WebSocket</span>
              {socketConnected ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" /> Disconnected
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-200">
              {socketConnected ? 'Gateway Active' : 'Connecting to Server...'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {socketConnected 
                ? `ID: ${socketDetails?.socketId ? socketDetails.socketId.substring(0, 10) + '...' : 'Online'}` 
                : 'Awaiting connection handshake'}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
            Protocol: <span className="text-civic-400">Socket.IO v4</span>
          </div>
        </div>
      </div>
    </div>
  );
}
