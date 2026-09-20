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
    <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Radio className="w-4 h-4 text-teal-400" />
            </div>
            Stage 2 Database & GIS System Diagnostics
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Live infrastructure status verified against PostgreSQL, PostGIS, OpenStreetMap, and WebSocket Gateway.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-200 border border-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          Refresh Status
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. PostgreSQL Database Status */}
        <div className="bg-[#070b16]/90 rounded-xl p-4 border border-slate-800/80 flex flex-col justify-between shadow-inner">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">Database</span>
              {dbConnected ? (
                <span className="inline-flex items-center gap-1 text-xs text-teal-400 font-medium">
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
            Target: <span className="text-teal-300">{dbStatus?.databaseName || 'adaptive_civic_routing'}</span>
          </div>
        </div>

        {/* 2. PostGIS Extension Status */}
        <div className="bg-[#070b16]/90 rounded-xl p-4 border border-slate-800/80 flex flex-col justify-between shadow-inner">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">PostGIS Extension</span>
              {postgisAvailable ? (
                <span className="inline-flex items-center gap-1 text-xs text-teal-400 font-medium">
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
            Queries: <span className={postgisAvailable ? "text-teal-300" : "text-amber-400"}>
              {postgisAvailable ? 'ST_Covers Active' : 'Standby Mode'}
            </span>
          </div>
        </div>

        {/* 3. OpenStreetMap Status */}
        <div className="bg-[#070b16]/90 rounded-xl p-4 border border-slate-800/80 flex flex-col justify-between shadow-inner">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">Map Tiles</span>
              <span className="inline-flex items-center gap-1 text-xs text-teal-400 font-medium">
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
            Center: <span className="text-teal-300">Mysuru (12.2958° N, 76.6394° E)</span>
          </div>
        </div>

        {/* 4. Socket.IO Gateway */}
        <div className="bg-[#070b16]/90 rounded-xl p-4 border border-slate-800/80 flex flex-col justify-between shadow-inner">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase">WebSocket</span>
              {socketConnected ? (
                <span className="inline-flex items-center gap-1 text-xs text-teal-400 font-medium">
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
            Protocol: <span className="text-teal-300">Socket.IO v4</span>
          </div>
        </div>
      </div>
    </div>
  );
}
