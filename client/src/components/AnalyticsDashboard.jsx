import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix default Leaflet icon paths in Vite bundles
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Map auto-invalidator to prevent gray tiles on mount
function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Auto-fit / re-center to real complaint coordinates when available
function MapAutoBounds({ points, activeCategory, focusCoord }) {
  const map = useMap();

  useEffect(() => {
    if (focusCoord) {
      map.setView(focusCoord, 15, { animate: true });
      return;
    }

    if (!points || points.length === 0) return;
    const validCoords = points
      .filter(p => p.latitude && p.longitude && !isNaN(p.latitude) && !isNaN(p.longitude));

    if (validCoords.length === 0) return;

    // Filter for coordinates in the Mysuru civic jurisdiction region
    // to prevent outside-boundary test points (e.g. New Delhi at 28.6139, 77.2090)
    // from pulling the auto-zoom out to zoom level 4 across the entire continent.
    const mysoreCoords = validCoords.filter(
      p => p.latitude >= 12.0 && p.latitude <= 12.6 && p.longitude >= 76.4 && p.longitude <= 76.9
    );

    const targetPoints = mysoreCoords.length > 0 ? mysoreCoords : validCoords;
    const coords = targetPoints.map(p => [parseFloat(p.latitude), parseFloat(p.longitude)]);

    try {
      const bounds = L.latLngBounds(coords);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      }
    } catch (e) {
      // Fallback to center
    }
  }, [points, activeCategory, focusCoord, map]);

  return null;
}
import { 
  BarChart3, 
  TrendingUp, 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  MapPin, 
  RefreshCw, 
  Filter, 
  Building2, 
  Compass, 
  Activity, 
  Users, 
  FileText,
  PieChart,
  HelpCircle,
  Database
} from 'lucide-react';
import {
  getAnalyticsOverview,
  getAnalyticsTrends,
  getAnalyticsCategories,
  getAnalyticsAuthorities,
  getAnalyticsDepartments,
  getAnalyticsRouting,
  getAnalyticsSla,
  getAnalyticsReviews,
  getAnalyticsJurisdictions,
  getAnalyticsSpatial
} from '../services/api';
import socket from '../services/socket';

const MYSURU_CENTER = [12.3100, 76.6350];

export default function AnalyticsDashboard() {
  // Global Filters
  const [filters, setFilters] = useState({
    days: 7,
    category: '',
    status: ''
  });

  // State for all analytics sections
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState(null);
  const [categoryData, setCategoryData] = useState(null);
  const [authorities, setAuthorities] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [routingData, setRoutingData] = useState(null);
  const [slaData, setSlaData] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [jurisdictionData, setJurisdictionData] = useState(null);
  const [spatialData, setSpatialData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [activeSpatialCategory, setActiveSpatialCategory] = useState('ALL');
  const [highlightComplaintCode, setHighlightComplaintCode] = useState('');

  // Debounced refresh ref
  const refreshTimeoutRef = useRef(null);

  // Fetch all analytics datasets from real PostgreSQL endpoints
  const fetchAllAnalytics = useCallback(async (currentFilters = filters, isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);

    try {
      const [
        ovRes,
        trRes,
        catRes,
        authRes,
        deptRes,
        routRes,
        slaRes,
        revRes,
        jurRes,
        spatRes
      ] = await Promise.all([
        getAnalyticsOverview(currentFilters),
        getAnalyticsTrends(currentFilters),
        getAnalyticsCategories(currentFilters),
        getAnalyticsAuthorities(currentFilters),
        getAnalyticsDepartments(currentFilters),
        getAnalyticsRouting(currentFilters),
        getAnalyticsSla(currentFilters),
        getAnalyticsReviews(currentFilters),
        getAnalyticsJurisdictions(currentFilters),
        getAnalyticsSpatial(currentFilters)
      ]);

      if (ovRes.success) setOverview(ovRes.data);
      if (trRes.success) setTrends(trRes.data);
      if (catRes.success) setCategoryData(catRes.data);
      if (authRes.success) setAuthorities(authRes.data);
      if (deptRes.success) setDepartments(deptRes.data);
      if (routRes.success) setRoutingData(routRes.data);
      if (slaRes.success) setSlaData(slaRes.data);
      if (revRes.success) setReviewData(revRes.data);
      if (jurRes.success) setJurisdictionData(jurRes.data);
      if (spatRes.success) setSpatialData(spatRes.data);

      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('[Analytics] Failed to fetch analytics data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  // Initial load and filter changes
  useEffect(() => {
    fetchAllAnalytics(filters, false);
  }, [filters, fetchAllAnalytics]);

  // Socket.IO event subscription for debounced real-time updates
  useEffect(() => {
    const triggerDebouncedRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        fetchAllAnalytics(filters, true);
      }, 1500); // 1.5s debounce to avoid excessive calls
    };

    const events = [
      'complaint:created',
      'routing:completed',
      'routing:review_required',
      'complaint:status_changed',
      'sla:warning',
      'sla:breached',
      'review:created',
      'review:resolved',
      'review:unroutable',
      'jurisdiction:version_activated'
    ];

    events.forEach(ev => socket.on(ev, triggerDebouncedRefresh));

    return () => {
      events.forEach(ev => socket.off(ev, triggerDebouncedRefresh));
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [filters, fetchAllAnalytics]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({ days: 7, category: '', status: '' });
  };

  // Helper for category color chips
  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'GARBAGE':
      case 'ILLEGAL_DUMPING':
      case 'C_AND_D_WASTE':
        return '#10b981'; // emerald
      case 'POTHOLE':
        return '#f59e0b'; // amber
      case 'WATER_LEAK':
      case 'DRAINAGE':
        return '#06b6d4'; // cyan
      case 'STREETLIGHT':
        return '#eab308'; // yellow
      default:
        return '#8b5cf6'; // purple
    }
  };

  // Filter spatial points based on local category selector
  const filteredComplaintPoints = useMemo(() => {
    if (!spatialData?.complaintPoints) return [];
    return spatialData.complaintPoints.filter(
      p => activeSpatialCategory === 'ALL' || p.category === activeSpatialCategory
    );
  }, [spatialData, activeSpatialCategory]);

  // Group points by coordinate to handle overlapping markers so new complaints are never hidden
  const groupedSpatialPoints = useMemo(() => {
    const groupsMap = new Map();
    for (const p of filteredComplaintPoints) {
      if (!p.latitude || !p.longitude) continue;
      const key = `${parseFloat(p.latitude).toFixed(6)},${parseFloat(p.longitude).toFixed(6)}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          latitude: parseFloat(p.latitude),
          longitude: parseFloat(p.longitude),
          complaints: []
        });
      }
      groupsMap.get(key).complaints.push(p);
    }
    return Array.from(groupsMap.values());
  }, [filteredComplaintPoints]);

  // Find focus coordinates if user searched a complaint code
  const focusCoord = useMemo(() => {
    if (!highlightComplaintCode.trim() || !spatialData?.complaintPoints) return null;
    const q = highlightComplaintCode.trim().toUpperCase();
    const found = spatialData.complaintPoints.find(
      p => p.complaint_code && p.complaint_code.toUpperCase().includes(q)
    );
    if (found && found.latitude && found.longitude) {
      return [parseFloat(found.latitude), parseFloat(found.longitude)];
    }
    return null;
  }, [highlightComplaintCode, spatialData]);

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* ========================================================================= */}
      {/* SECTION 1: HEADER CONTROLS, FILTERS & DEMO DATA NOTICE                    */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-emerald-400" />
                Operational Analytics & Routing Intelligence
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                DEMO / SYNTHETIC DATA
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Real-time PostgreSQL read-only analytics dashboard • Immutable historical provenance • 11 Operational Sections
            </p>
          </div>

          {/* Action pills & refresh */}
          <div className="flex items-center gap-3">
            {lastRefreshed && (
              <span className="text-xs font-mono text-slate-400 hidden sm:inline">
                Synced at: {lastRefreshed}
              </span>
            )}
            <button
              onClick={() => fetchAllAnalytics(filters, true)}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Live Refresh'}
            </button>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Filters:</span>
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => handleFilterChange('days', 7)}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                filters.days === 7
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => handleFilterChange('days', 30)}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                filters.days === 30
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => handleFilterChange('days', null)}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                !filters.days
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Category Filter */}
          <select
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Categories</option>
            <option value="GARBAGE">Garbage</option>
            <option value="ILLEGAL_DUMPING">Illegal Dumping</option>
            <option value="POTHOLE">Pothole</option>
            <option value="DRAINAGE">Drainage</option>
            <option value="STREETLIGHT">Streetlight</option>
            <option value="C_AND_D_WASTE">C&D Waste</option>
            <option value="WATER_LEAK">Water Leak</option>
            <option value="OTHER">Other</option>
          </select>

          {/* Status Filter */}
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="TRIAGED">Triaged</option>
            <option value="ROUTED">Routed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
            <option value="HUMAN_REVIEW">Human Review</option>
          </select>

          {(filters.category || filters.status || filters.days !== 7) && (
            <button
              onClick={resetFilters}
              className="text-xs text-emerald-400 hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {loading && !overview ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Aggregating real operational analytics from PostgreSQL...</p>
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* SECTION 2: OPERATIONAL OVERVIEW (KPI CARDS)                               */}
          {/* ========================================================================= */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              1. Operational Overview & Key Performance Indicators
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {/* Total Complaints */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>TOTAL COMPLAINTS</span>
                  <FileText className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {overview?.totalComplaints ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {overview?.complaintsToday ?? 0} reported today
                </div>
              </div>

              {/* Routed */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between text-xs text-cyan-400 mb-1">
                  <span>ROUTED</span>
                  <Compass className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold text-cyan-300">
                  {overview?.statusBreakdown?.routed ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Success rate: {overview?.routingSuccessRate != null ? `${overview.routingSuccessRate}%` : 'N/A'}
                </div>
              </div>

              {/* Open / Active */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between text-xs text-amber-400 mb-1">
                  <span>ACTIVE / OPEN</span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-amber-300">
                  {overview?.unresolvedOpen ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {overview?.statusBreakdown?.inProgress ?? 0} currently in progress
                </div>
              </div>

              {/* Resolved */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
                  <span>RESOLVED</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-300">
                  {(overview?.statusBreakdown?.resolved ?? 0) + (overview?.statusBreakdown?.closed ?? 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {overview?.statusBreakdown?.closed ?? 0} closed permanently
                </div>
              </div>

              {/* Human Review Queue */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between text-xs text-purple-400 mb-1">
                  <span>HUMAN REVIEW</span>
                  <Users className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-purple-300">
                  {overview?.openReviews ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Rate: {overview?.humanReviewRate != null ? `${overview.humanReviewRate}%` : 'N/A'}
                </div>
              </div>

              {/* SLA Warnings */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between text-xs text-amber-400 mb-1">
                  <span>SLA AT RISK</span>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-amber-400">
                  {overview?.slaWarnings ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Approaching deadline
                </div>
              </div>

              {/* SLA Breaches */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between text-xs text-rose-400 mb-1">
                  <span>SLA BREACHED</span>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl font-bold text-rose-400">
                  {overview?.slaBreaches ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Overdue resolution
                </div>
              </div>

              {/* SLA Compliance Rate */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg col-span-2 md:col-span-1">
                <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
                  <span>SLA COMPLIANCE</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400">
                  {overview?.slaComplianceRate != null ? `${overview.slaComplianceRate}%` : 'N/A'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {overview?.slaTracked ?? 0} tracked total
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 3: COMPLAINT TRENDS (RESPONSIVE SVG TIME-SERIES)                  */}
          {/* ========================================================================= */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  2. Complaint Trends ({trends?.days || 7} Days)
                </h3>
                <p className="text-xs text-slate-400">
                  Real daily complaint intake, routed cases, human reviews, and resolutions
                </p>
              </div>
            </div>

            {trends?.trends && trends.trends.length > 0 ? (
              <div className="space-y-4">
                {/* SVG Trend Visualization */}
                <div className="h-48 w-full bg-slate-950/60 rounded-xl p-4 border border-slate-800/80 flex flex-col justify-end">
                  <div className="flex-1 flex items-end justify-between gap-2 pt-4">
                    {trends.trends.map((item, idx) => {
                      const maxVal = Math.max(...trends.trends.map(t => t.complaint_count), 5);
                      const heightPercent = Math.max(Math.round((item.complaint_count / maxVal) * 100), 4);
                      const routedPercent = item.complaint_count > 0 
                        ? Math.round((item.routed_count / item.complaint_count) * 100) 
                        : 0;

                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                          {/* Tooltip */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-14 bg-slate-900 border border-slate-700 text-white text-[10px] rounded px-2 py-1 pointer-events-none shadow-xl z-20 whitespace-nowrap">
                            <div className="font-semibold">{item.date}</div>
                            <div>Total: {item.complaint_count} | Routed: {item.routed_count}</div>
                            <div>Review: {item.human_review_count} | Resolved: {item.resolved_count}</div>
                          </div>

                          {/* Bar */}
                          <div className="w-full max-w-[28px] flex flex-col justify-end h-32 bg-slate-900 rounded-t overflow-hidden">
                            <div
                              style={{ height: `${heightPercent}%` }}
                              className="w-full bg-gradient-to-t from-emerald-600 to-cyan-500 rounded-t transition-all duration-300 relative group-hover:brightness-125"
                            >
                              {item.complaint_count > 0 && (
                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-300">
                                  {item.complaint_count}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Date label */}
                          <span className="text-[10px] text-slate-500 font-mono">
                            {item.date.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center justify-center gap-6 text-xs text-slate-400 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span>Intake Volume</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-cyan-500" />
                    <span>Routed Decisions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-purple-500" />
                    <span>Human Review Escalated</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-6 text-center">
                No data available for the selected filters.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ========================================================================= */}
            {/* SECTION 4: CATEGORY BREAKDOWN                                             */}
            {/* ========================================================================= */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-400" />
                3. Category Distribution ({categoryData?.totalComplaints || 0} Total)
              </h3>

              {categoryData?.categories && categoryData.categories.length > 0 ? (
                <div className="space-y-3">
                  {categoryData.categories.map((c) => (
                    <div key={c.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200 flex items-center gap-2">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: getCategoryColor(c.category) }} 
                          />
                          {c.category}
                        </span>
                        <div className="font-mono text-slate-400">
                          <span className="text-white font-bold">{c.count}</span>
                          <span className="ml-1 text-[11px] text-slate-500">
                            ({c.percentage != null ? `${c.percentage}%` : 'N/A'})
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${c.percentage || 0}%`,
                            backgroundColor: getCategoryColor(c.category)
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 py-6 text-center">
                  No data available for the selected filters.
                </div>
              )}
            </div>

            {/* ========================================================================= */}
            {/* SECTION 5: ROUTING INTELLIGENCE MATRIX                                    */}
            {/* ========================================================================= */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Compass className="w-4 h-4 text-cyan-400" />
                4. Deterministic Routing Intelligence
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">GIS-Rule Routed</span>
                  <span className="text-xl font-bold text-cyan-400">
                    {routingData?.gisRuleCount ?? 0}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Deterministic ST_Covers match
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Operator Review</span>
                  <span className="text-xl font-bold text-purple-400">
                    {routingData?.humanReviewCount ?? 0}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Ambiguity / boundary fallback
                  </span>
                </div>
              </div>

              {/* Category -> Authority Mapping Table */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase">
                  Category → Authority Resolution
                </h4>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 sticky top-0">
                      <tr>
                        <th className="p-2">Category</th>
                        <th className="p-2">Routed Authority</th>
                        <th className="p-2 text-right">Decisions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {routingData?.breakdowns?.categoryToAuthority?.length > 0 ? (
                        routingData.breakdowns.categoryToAuthority.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40">
                            <td className="p-2 font-mono text-[11px]">{item.category}</td>
                            <td className="p-2">{item.authority_name}</td>
                            <td className="p-2 text-right font-bold text-white">{item.count}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3" className="p-3 text-center text-slate-500">
                            No routing decisions recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 6: AUTHORITY WORKLOAD                                             */}
          {/* ========================================================================= */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              5. Civic Authority Workload (Stored Decisions)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {authorities && authorities.length > 0 ? (
                authorities.map((auth) => (
                  <div 
                    key={auth.authorityId}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="font-bold text-white text-base flex items-center gap-2">
                          {auth.authorityName}
                        </h4>
                        <span className="text-xs font-mono text-emerald-400">Code: {auth.authorityCode}</span>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-800 text-slate-300">
                        {auth.routedComplaints} Routed
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">ACTIVE CASES</span>
                        <span className="text-base font-bold text-amber-300">{auth.activeComplaints}</span>
                      </div>
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">RESOLVED</span>
                        <span className="text-base font-bold text-emerald-400">{auth.resolvedComplaints}</span>
                      </div>
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">HUMAN REVIEW</span>
                        <span className="text-base font-bold text-purple-400">{auth.humanReviewCases}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs px-2 pt-1">
                      <span className="text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Warnings: <strong>{auth.slaWarnings}</strong>
                      </span>
                      <span className="text-rose-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Breaches: <strong>{auth.slaBreaches}</strong>
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-2 text-xs text-slate-400 py-6 text-center bg-slate-900 rounded-xl border border-slate-800">
                  No authority data recorded.
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 7: DEPARTMENT WORKLOAD                                            */}
          {/* ========================================================================= */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              6. Municipal Department Workload Distribution
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="p-3">Department</th>
                    <th className="p-3">Authority</th>
                    <th className="p-3 text-center">Routed</th>
                    <th className="p-3 text-center">Active</th>
                    <th className="p-3 text-center">Resolved</th>
                    <th className="p-3 text-center text-amber-400">Warnings</th>
                    <th className="p-3 text-center text-rose-400">Breaches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {departments && departments.length > 0 ? (
                    departments.map((d) => (
                      <tr key={d.departmentId} className="hover:bg-slate-800/40">
                        <td className="p-3">
                          <span className="font-semibold text-white block">{d.departmentName}</span>
                          <span className="font-mono text-[10px] text-slate-500">{d.departmentCode}</span>
                        </td>
                        <td className="p-3 text-slate-300">{d.authorityName}</td>
                        <td className="p-3 text-center font-bold text-cyan-300">{d.routedComplaints}</td>
                        <td className="p-3 text-center font-bold text-amber-300">{d.activeComplaints}</td>
                        <td className="p-3 text-center font-bold text-emerald-400">{d.resolvedComplaints}</td>
                        <td className="p-3 text-center font-bold text-amber-400">{d.slaWarnings}</td>
                        <td className="p-3 text-center font-bold text-rose-400">{d.slaBreaches}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="p-4 text-center text-slate-500">
                        No departmental routing data recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ========================================================================= */}
            {/* SECTION 8: SLA HEALTH & COMPLIANCE BENCHMARKS                             */}
            {/* ========================================================================= */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  7. SLA Health & Benchmarks
                </h3>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-500/30">
                  {slaData?.complianceRate != null ? `${slaData.complianceRate}% Compliance` : 'N/A'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">ON TRACK</span>
                  <span className="text-lg font-bold text-emerald-400">{slaData?.onTrack ?? 0}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">WARNING (RISK)</span>
                  <span className="text-lg font-bold text-amber-400">{slaData?.warning ?? 0}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">BREACHED</span>
                  <span className="text-lg font-bold text-rose-400">{slaData?.breached ?? 0}</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase">
                  Category Benchmark Compliance
                </h4>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 sticky top-0">
                      <tr>
                        <th className="p-2">Category</th>
                        <th className="p-2 text-center">Target (h)</th>
                        <th className="p-2 text-center">Tracked</th>
                        <th className="p-2 text-right">Compliance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {slaData?.byCategory && slaData.byCategory.length > 0 ? (
                        slaData.byCategory.map((cat, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40">
                            <td className="p-2 font-mono text-[11px]">{cat.category}</td>
                            <td className="p-2 text-center text-slate-400">{cat.targetHours}h</td>
                            <td className="p-2 text-center font-bold">{cat.total}</td>
                            <td className="p-2 text-right font-bold text-emerald-400">
                              {cat.complianceRate != null ? `${cat.complianceRate}%` : 'N/A'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="p-3 text-center text-slate-500">
                            No category SLA data.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 9: HUMAN REVIEW QUEUE ANALYTICS                                   */}
            {/* ========================================================================= */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                8. Operator Human-in-the-Loop Queue
              </h3>

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">OPEN</span>
                  <span className="text-lg font-bold text-amber-400">{reviewData?.open ?? 0}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">IN REVIEW</span>
                  <span className="text-lg font-bold text-purple-400">{reviewData?.inReview ?? 0}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">RESOLVED</span>
                  <span className="text-lg font-bold text-emerald-400">{reviewData?.resolved ?? 0}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">REJECTED</span>
                  <span className="text-lg font-bold text-rose-400">{reviewData?.rejected ?? 0}</span>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Total Review Cases Generated:</span>
                  <span className="font-bold text-white">{reviewData?.totalReviews ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Operator-Routed To Authority:</span>
                  <span className="font-bold text-cyan-400">{reviewData?.humanRoutedCases ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Marked Officially Unroutable:</span>
                  <span className="font-bold text-slate-400">{reviewData?.unroutableCases ?? 0}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800/80 pt-2">
                  <span className="text-slate-300 font-semibold">Average Turnaround Time:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {reviewData?.averageTurnaroundHours != null ? `${reviewData.averageTurnaroundHours} hours` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 10: JURISDICTION HISTORICAL PROVENANCE                            */}
          {/* ========================================================================= */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  9. Historical Jurisdiction Provenance (Immutable Routing V1 vs V2)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complaints permanently preserve the jurisdiction version under which they were routed. No retroactive boundary mutations.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="p-3">Jurisdiction Version</th>
                    <th className="p-3">Version Status</th>
                    <th className="p-3 text-center">Total Complaints</th>
                    <th className="p-3 text-center">Successfully Routed</th>
                    <th className="p-3 text-center">Human Review Escalations</th>
                    <th className="p-3 text-center">Unroutable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {jurisdictionData?.versionProvenances && jurisdictionData.versionProvenances.length > 0 ? (
                    jurisdictionData.versionProvenances.map((vp) => (
                      <tr key={vp.versionId} className="hover:bg-slate-800/40">
                        <td className="p-3">
                          <span className="font-bold text-white font-mono">{vp.versionCode}</span>
                          <span className="ml-2 text-[11px] text-slate-500">(Version #{vp.versionNumber})</span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            vp.versionStatus === 'ACTIVE' 
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                              : vp.versionStatus === 'ARCHIVED'
                              ? 'bg-slate-800 text-slate-400 border border-slate-700'
                              : 'bg-amber-950 text-amber-400 border border-amber-500/30'
                          }`}>
                            {vp.versionStatus}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-white">{vp.totalComplaints}</td>
                        <td className="p-3 text-center font-bold text-emerald-400">{vp.routedComplaints}</td>
                        <td className="p-3 text-center font-bold text-purple-400">{vp.humanReviewComplaints}</td>
                        <td className="p-3 text-center font-bold text-slate-400">{vp.unroutableComplaints}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="p-4 text-center text-slate-500">
                        No versioned routing provenance recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 11: SPATIAL COMPLAINT DISTRIBUTION                                */}
          {/* ========================================================================= */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  10. Spatial Complaint Distribution ({filteredComplaintPoints.length} Mapped Points{activeSpatialCategory !== 'ALL' ? ` • ${activeSpatialCategory}` : ''})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real PostGIS coordinates from PostgreSQL • Genuine point concentration (No AI hotspot fabrication)
                </p>
              </div>

              {/* Spatial Category Quick Filter & Code Finder */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Find Code (e.g. 000656)"
                  value={highlightComplaintCode}
                  onChange={(e) => setHighlightComplaintCode(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 w-44 font-mono uppercase"
                />
                {highlightComplaintCode && (
                  <button
                    onClick={() => setHighlightComplaintCode('')}
                    className="text-slate-400 hover:text-slate-200 text-xs px-1"
                  >
                    Clear
                  </button>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Map Filter:</span>
                  <select
                    value={activeSpatialCategory}
                    onChange={(e) => setActiveSpatialCategory(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="GARBAGE">Garbage</option>
                    <option value="ILLEGAL_DUMPING">Illegal Dumping</option>
                    <option value="POTHOLE">Pothole</option>
                    <option value="DRAINAGE">Drainage</option>
                    <option value="STREETLIGHT">Streetlight</option>
                    <option value="C_AND_D_WASTE">C&D Waste</option>
                    <option value="WATER_LEAK">Water Leak</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Leaflet Map */}
            <div className="h-[450px] w-full rounded-xl overflow-hidden border border-slate-800 relative z-0">
              <MapContainer
                center={MYSURU_CENTER}
                zoom={12}
                className="h-full w-full"
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapInvalidator />
                <MapAutoBounds
                  points={filteredComplaintPoints}
                  activeCategory={activeSpatialCategory}
                  focusCoord={focusCoord}
                />

                {/* Spatial Complaint Points (Grouped by coordinate to handle overlapping points without burying new complaints) */}
                {groupedSpatialPoints.map((group) => {
                  const primary = group.complaints[0];
                  const hasMultiple = group.complaints.length > 1;
                  const isHighlighted = highlightComplaintCode &&
                    group.complaints.some(c => c.complaint_code?.toUpperCase().includes(highlightComplaintCode.trim().toUpperCase()));
                  const color = getCategoryColor(primary.category);

                  return (
                    <CircleMarker
                      key={group.key}
                      center={[group.latitude, group.longitude]}
                      radius={isHighlighted ? 9 : (hasMultiple ? 7.5 : 6)}
                      pathOptions={{
                        fillColor: isHighlighted ? '#eab308' : color,
                        fillOpacity: 0.9,
                        color: isHighlighted ? '#ffffff' : (hasMultiple ? '#f8fafc' : '#ffffff'),
                        weight: isHighlighted ? 2.5 : (hasMultiple ? 2 : 1.5)
                      }}
                    >
                      <Popup className="text-slate-900 max-w-xs">
                        <div className="p-1 space-y-1.5 text-xs">
                          {hasMultiple && (
                            <div className="flex items-center justify-between pb-1 border-b border-slate-200 text-[11px] font-semibold text-indigo-700">
                              <span>📍 {group.complaints.length} Complaints at this Point</span>
                              <span className="bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded text-[10px]">Latest on Top</span>
                            </div>
                          )}

                          {/* Primary (Newest) Complaint Details */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-slate-900 text-sm font-mono">{primary.complaint_code}</span>
                              {hasMultiple && (
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded font-bold">LATEST</span>
                              )}
                            </div>
                            <div>Category: <strong>{primary.category}</strong></div>
                            <div>Status: <strong className={primary.status === 'ROUTED' ? 'text-emerald-700' : 'text-slate-700'}>{primary.status}</strong></div>
                            <div>Authority: <strong>{primary.authority_name || 'Unassigned'}</strong></div>
                            {primary.department_name && (
                              <div>Department: <strong>{primary.department_name}</strong></div>
                            )}
                            <div>Jurisdiction: <strong>{primary.jurisdiction_name || 'Out of bounds'}</strong></div>
                            <div>SLA Status: <strong className={primary.sla_status === 'SLA_BREACHED' ? 'text-rose-600' : 'text-emerald-600'}>{primary.sla_status || 'WITHIN_SLA'}</strong></div>
                            <div className="text-[10px] text-slate-500 pt-0.5">Reported: {new Date(primary.created_at).toLocaleString()}</div>
                          </div>

                          {/* Multiple complaints list */}
                          {hasMultiple && (
                            <div className="pt-1.5 border-t border-slate-200">
                              <div className="text-[11px] font-semibold text-slate-700 mb-1">
                                All complaints at this coordinate ({group.complaints.length}):
                              </div>
                              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                                {group.complaints.map((c, idx) => (
                                  <div
                                    key={c.id || idx}
                                    className={`p-1 rounded text-[11px] border ${
                                      idx === 0
                                        ? 'bg-emerald-50 border-emerald-300 font-semibold'
                                        : 'bg-slate-50 border-slate-200 text-slate-600'
                                    }`}
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className="font-mono">{c.complaint_code}</span>
                                      <span className="text-[10px] font-semibold">{c.category}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-500">
                                      <span>{c.status}</span>
                                      <span>{new Date(c.created_at).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </div>

            {/* Jurisdiction Spatial Distribution Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">
                  Complaints by Spatial Boundary
                </h4>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {spatialData?.jurisdictionDistribution && spatialData.jurisdictionDistribution.length > 0 ? (
                    spatialData.jurisdictionDistribution.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">{item.jurisdiction_name} ({item.authority_name})</span>
                        <span className="font-bold text-emerald-400 font-mono">{item.count}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No mapped distribution available.</span>
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">
                  Complaint Concentration (PostGIS ST_ClusterDBSCAN)
                </h4>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {spatialData?.spatialConcentrationClusters && spatialData.spatialConcentrationClusters.length > 0 ? (
                    spatialData.spatialConcentrationClusters.map((cluster) => (
                      <div key={cluster.cluster_id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">
                          Cluster #{cluster.cluster_id} ({cluster.center_lat}, {cluster.center_lng})
                        </span>
                        <span className="font-bold text-amber-400 font-mono">
                          {cluster.point_count} reports
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">
                      No multi-point concentrations detected under current spatial cluster thresholds.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
