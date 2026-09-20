import React, { useState, useEffect } from 'react';
import {
  FileText,
  Compass,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  ShieldCheck,
  TrendingUp,
  PieChart,
  Layers,
  MapPin,
  ArrowRight,
  Database,
  RefreshCw,
  Activity,
  Send,
  ExternalLink
} from 'lucide-react';
import { MapContainer, GeoJSON, CircleMarker, Popup } from 'react-leaflet';
import L from 'leaflet';
import CivicMapLayers from './CivicMapLayers';
import MapLayerToggle from './MapLayerToggle';
import {
  getAnalyticsOverview,
  getAnalyticsTrends,
  getAnalyticsCategories,
  getJurisdictionBoundaries,
  getAuditLogs,
  getAnalyticsSpatial
} from '../services/api';
import socket from '../services/socket';

const MYSURU_CENTER = [12.3100, 76.6350];

// Category color mapping consistent with the rest of the application
const CATEGORY_COLORS = {
  GARBAGE: '#10b981',
  ILLEGAL_DUMPING: '#059669',
  POTHOLE: '#f59e0b',
  DRAINAGE: '#06b6d4',
  STREETLIGHT: '#8b5cf6',
  C_AND_D_WASTE: '#ec4899',
  WATER_LEAK: '#3b82f6',
  OTHER: '#64748b'
};

export default function DashboardView({
  activeVersionCode = 'MYS_2026_V1',
  onNavigate,
  onSelectComplaint
}) {
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState(null);
  const [categoryData, setCategoryData] = useState(null);
  const [boundaries, setBoundaries] = useState(null);
  const [recentAudit, setRecentAudit] = useState([]);
  const [spatialPoints, setSpatialPoints] = useState([]);
  const [mapLayer, setMapLayer] = useState('standard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);

    try {
      const [ovRes, trRes, catRes, boundRes, auditRes, spatRes] = await Promise.all([
        getAnalyticsOverview({ days: 7 }),
        getAnalyticsTrends({ days: 7 }),
        getAnalyticsCategories({ days: 7 }),
        getJurisdictionBoundaries(activeVersionCode || null),
        getAuditLogs({ limit: 5, offset: 0 }),
        getAnalyticsSpatial({ days: 7 })
      ]);

      if (ovRes.success) setOverview(ovRes.data);
      if (trRes.success) setTrends(trRes.data);
      if (catRes.success) setCategoryData(catRes.data);
      if (boundRes.success && boundRes.data) setBoundaries(boundRes.data);
      if (auditRes.success && auditRes.data) setRecentAudit(auditRes.data);
      if (spatRes.success && spatRes.data?.complaintPoints) {
        setSpatialPoints(spatRes.data.complaintPoints.slice(0, 100));
      }
    } catch (err) {
      console.error('Failed to load dashboard operational data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeVersionCode]);

  // Real-time updates via Socket.IO
  useEffect(() => {
    const handleComplaintChange = () => {
      fetchDashboardData(true);
    };

    socket.on('complaint:created', handleComplaintChange);
    socket.on('routing:completed', handleComplaintChange);
    socket.on('routing:review_required', handleComplaintChange);
    socket.on('complaint:status_changed', handleComplaintChange);

    return () => {
      socket.off('complaint:created', handleComplaintChange);
      socket.off('routing:completed', handleComplaintChange);
      socket.off('routing:review_required', handleComplaintChange);
      socket.off('complaint:status_changed', handleComplaintChange);
    };
  }, []);

  const getBoundaryStyle = (feature) => {
    const authCode = feature.properties?.authorityCode;
    const isMcc = authCode === 'MCC_DEMO' || authCode === 'MCC';
    return {
      color: isMcc ? '#0ea5e9' : '#10b981',
      weight: 2,
      fillColor: isMcc ? '#0ea5e9' : '#10b981',
      fillOpacity: 0.18,
      dashArray: null
    };
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ========================================================================= */}
      {/* HEADER: TITLE & QUICK REFRESH                                             */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Dashboard
            <span className="text-xs font-mono text-teal-400 bg-teal-950/60 px-2.5 py-0.5 rounded-full border border-teal-500/30">
              Command Center
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time civic routing for a cleaner Mysuru • PostGIS containment • Immutable audit provenance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-2 border border-slate-750 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-teal-400' : ''}`} />
            {refreshing ? 'Syncing...' : 'Sync Live Data'}
          </button>
          <button
            onClick={() => onNavigate('complaints')}
            className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-950/30 transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Submit Issue</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 1: 5 HIGH-DENSITY KPI CARDS (MATCHING REFERENCE IMAGE)                */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Complaints */}
        <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-4 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Total Complaints</span>
            <FileText className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white font-mono">
            {overview?.totalComplaints ?? 0}
          </div>
          <div className="text-[11px] text-cyan-400/90 font-mono mt-1 flex items-center gap-1">
            <span>+{overview?.complaintsToday ?? 0} reported today</span>
          </div>
        </div>

        {/* PostGIS Routed */}
        <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-4 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between text-xs text-teal-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">PostGIS Routed</span>
            <Compass className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-teal-300 font-mono">
            {overview?.statusBreakdown?.routed ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-1">
            {overview?.routingSuccessRate != null ? `${overview.routingSuccessRate}% success rate` : 'Deterministic'}
          </div>
        </div>

        {/* Active / Open */}
        <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-4 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between text-xs text-amber-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Active / Open</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-amber-300 font-mono">
            {overview?.unresolvedOpen ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-1">
            {overview?.statusBreakdown?.inProgress ?? 0} in progress
          </div>
        </div>

        {/* Resolved */}
        <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-4 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-300 font-mono">
            {(overview?.statusBreakdown?.resolved ?? 0) + (overview?.statusBreakdown?.closed ?? 0)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-1">
            {overview?.statusBreakdown?.closed ?? 0} closed permanently
          </div>
        </div>

        {/* Human Review */}
        <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-4 shadow-lg backdrop-blur col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-purple-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Human Review</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-purple-300 font-mono">
            {overview?.openReviews ?? 0}
          </div>
          <div className="text-[11px] text-purple-400/90 font-mono mt-1">
            {overview?.humanReviewRate != null ? `${overview.humanReviewRate}% escalation rate` : 'Guarded'}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 2: LIVE JURISDICTION MAP (LEFT) + SYSTEM STATE (RIGHT)                */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Live Jurisdiction Map */}
        <div className="lg:col-span-8 bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 shadow-xl backdrop-blur flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-400" />
                Live Jurisdiction Map
              </h3>
              <p className="text-xs text-slate-400">
                PostGIS MultiPolygon boundaries with mapped civic complaint coordinates
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Standard / Satellite Layer Switcher */}
              <MapLayerToggle mapLayer={mapLayer} onToggle={setMapLayer} />

              <button
                onClick={() => onNavigate('jurisdictions')}
                className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 transition"
              >
                <span>Manage Boundaries</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Embedded Leaflet Map (Medium Size 520px) */}
          <div className="h-[520px] w-full rounded-xl overflow-hidden border border-slate-800 relative z-0">
            <MapContainer
              center={MYSURU_CENTER}
              zoom={12}
              className="h-full w-full"
              scrollWheelZoom={false}
            >
              <CivicMapLayers mapLayer={mapLayer} />

              {/* GeoJSON Boundary Polygons */}
              {boundaries && boundaries.features && boundaries.features.length > 0 && (
                <GeoJSON
                  key={`geojson-dashboard-${activeVersionCode}`}
                  data={boundaries}
                  style={getBoundaryStyle}
                />
              )}

              {/* Spatial Complaint Points */}
              {spatialPoints.map((p, idx) => {
                if (!p.latitude || !p.longitude) return null;
                const lat = parseFloat(p.latitude);
                const lng = parseFloat(p.longitude);
                if (isNaN(lat) || isNaN(lng)) return null;

                const color = CATEGORY_COLORS[p.category] || '#0ea5e9';

                return (
                  <CircleMarker
                    key={p.id || idx}
                    center={[lat, lng]}
                    radius={5}
                    pathOptions={{
                      fillColor: color,
                      fillOpacity: 0.9,
                      color: '#ffffff',
                      weight: 1
                    }}
                  >
                    <Popup className="text-slate-900 text-xs">
                      <div className="p-1 space-y-1 font-sans">
                        <span className="font-bold font-mono text-xs block">{p.complaint_code}</span>
                        <div>Category: <strong>{p.category}</strong></div>
                        <div>Status: <strong>{p.status}</strong></div>
                        <div>Authority: <strong>{p.authority_name || 'Unassigned'}</strong></div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>

          {/* Map Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-[11px] text-slate-400 font-mono border-t border-slate-800/80 mt-3">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-sky-500/50 border border-sky-400 inline-block" />
                MCC Central (City Corp)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500/50 border border-emerald-400 inline-block" />
                MUDA Sector (Urban Dev)
              </span>
            </div>
            <span className="text-teal-400 font-semibold">
              {spatialPoints.length} Live Mapped Cases
            </span>
          </div>
        </div>

        {/* Right: Active Spatial Jurisdiction & Quick Actions */}
        <div className="lg:col-span-4 space-y-4">
          {/* Active Jurisdiction Card */}
          <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 shadow-xl backdrop-blur space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Active Boundary Version
                </span>
                <h4 className="text-lg font-bold font-mono text-teal-300">
                  {activeVersionCode}
                </h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                ACTIVE
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Spatial SRID:</span>
                <span className="font-mono text-slate-200">EPSG:4326 (WGS84)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Spatial Index:</span>
                <span className="font-mono text-emerald-400">GiST Index Active</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Deterministic Containment:</span>
                <span className="font-mono text-slate-200">PostGIS ST_Covers</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Immutability Triggers:</span>
                <span className="font-mono text-emerald-400">NO UPDATE / DELETE</span>
              </div>
            </div>

            {/* Quick Action Navigation Grid */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Quick Operations
              </span>
              <button
                onClick={() => onNavigate('routing')}
                className="w-full px-3 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 text-xs font-semibold text-slate-200 flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  <span>Inspect Routing Engine</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform group-hover:translate-x-0.5" />
              </button>

              <button
                onClick={() => onNavigate('review')}
                className="w-full px-3 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 text-xs font-semibold text-slate-200 flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  <span>Operator Review Queue</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform group-hover:translate-x-0.5" />
              </button>

              <button
                onClick={() => onNavigate('audit')}
                className="w-full px-3 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 text-xs font-semibold text-slate-200 flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal-400" />
                  <span>Immutable Audit Ledger</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 3: COMPLAINT TRENDS (LEFT) + CATEGORY DISTRIBUTION (RIGHT)            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Complaint Trends */}
        <div className="lg:col-span-7 bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 shadow-xl backdrop-blur space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-400" />
                7-Day Complaint Volume & Routing Velocity
              </h3>
              <p className="text-xs text-slate-400">
                Daily complaint intake against deterministic resolution
              </p>
            </div>
            <button
              onClick={() => onNavigate('analytics')}
              className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 transition"
            >
              <span>Full Analytics</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {trends?.trends && trends.trends.length > 0 ? (
            <div className="pt-2">
              <div className="h-40 w-full bg-[#0a0f1e]/80 rounded-xl p-3 border border-slate-800/80 flex items-end justify-between gap-2">
                {trends.trends.map((item, idx) => {
                  const maxVal = Math.max(...trends.trends.map(t => t.complaint_count), 5);
                  const heightPercent = Math.max(Math.round((item.complaint_count / maxVal) * 100), 6);

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 bg-slate-900 border border-slate-700 text-white text-[10px] rounded px-2 py-1 pointer-events-none shadow-xl z-20 whitespace-nowrap">
                        <div className="font-semibold">{item.date}</div>
                        <div>Total: {item.complaint_count} | Routed: {item.routed_count}</div>
                      </div>

                      {/* Bar */}
                      <div className="w-full max-w-[24px] flex flex-col justify-end h-24 bg-slate-900 rounded-t overflow-hidden">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-gradient-to-t from-teal-600 to-cyan-400 rounded-t transition-all duration-300 relative group-hover:brightness-125"
                        />
                      </div>

                      <span className="text-[10px] text-slate-400 font-mono">
                        {item.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500 font-mono">
              Loading trends data from PostgreSQL...
            </div>
          )}
        </div>

        {/* Right: Category Distribution */}
        <div className="lg:col-span-5 bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 shadow-xl backdrop-blur space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-cyan-400" />
              Category Breakdown
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {categoryData?.totalComplaints || 0} Total
            </span>
          </div>

          <div className="space-y-2.5 pt-1 overflow-y-auto max-h-48 pr-1">
            {categoryData?.categories && categoryData.categories.length > 0 ? (
              categoryData.categories.slice(0, 5).map((c) => {
                const color = CATEGORY_COLORS[c.category] || '#0ea5e9';
                const pct = c.percentage != null ? `${c.percentage}%` : '0%';

                return (
                  <div key={c.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        {c.category}
                      </span>
                      <span className="text-white font-bold">
                        {c.count} ({pct})
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: pct, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-slate-500 font-mono">
                No category breakdown recorded.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 4: RECENT IMMUTABLE AUDIT TRAIL STREAM                                */}
      {/* ========================================================================= */}
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 shadow-xl backdrop-blur space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              Recent Immutable Audit Ledger
            </h3>
            <p className="text-xs text-slate-400">
              Live transactional provenance protected by PostgreSQL immutability triggers
            </p>
          </div>
          <button
            onClick={() => onNavigate('audit')}
            className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 transition"
          >
            <span>View All Records</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#060a14]/60 text-slate-400 font-mono text-[11px]">
              <tr>
                <th className="p-2.5">Action</th>
                <th className="p-2.5">Entity</th>
                <th className="p-2.5">Actor</th>
                <th className="p-2.5">Severity</th>
                <th className="p-2.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-300">
              {recentAudit && recentAudit.length > 0 ? (
                recentAudit.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="p-2.5 font-bold text-teal-300">{log.action}</td>
                    <td className="p-2.5 text-slate-200">
                      {log.entity_type} {log.entity_id ? `(${log.entity_id.substring(0, 8)}...)` : ''}
                    </td>
                    <td className="p-2.5 text-slate-400">{log.actor_email || 'SYSTEM'}</td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                        log.severity === 'WARNING' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                        'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}>
                        {log.severity || 'INFO'}
                      </span>
                    </td>
                    <td className="p-2.5 text-right text-slate-500">
                      {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-4 text-center text-slate-500">
                    No recent audit transactions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
