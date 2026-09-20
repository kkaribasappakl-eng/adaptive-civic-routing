import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  KeyRound, 
  Filter, 
  RefreshCw, 
  Search, 
  Calendar, 
  Database, 
  Eye, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  FileText, 
  Users, 
  Activity, 
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  Terminal,
  Download
} from 'lucide-react';
import { getAuditLogs, getAuditLogById, getAuditSummary } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function AuditLogDashboard() {
  const { user, role, isAdmin, isOperator } = useAuth();

  // Filters
  const [filters, setFilters] = useState({
    action: '',
    entity_type: '',
    severity: '',
    search: '',
    limit: 25,
    offset: 0
  });

  // Data states
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 25, offset: 0, page: 1, totalPages: 1, has_more: false });
  const [summary, setSummary] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedLogDetail, setSelectedLogDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Quick preset filter
  const [activePreset, setActivePreset] = useState('ALL');

  // Fetch Summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await getAuditSummary();
      if (res.success) {
        setSummary(res.data);
      }
    } catch (err) {
      console.error('Failed to load audit summary:', err);
    }
  }, []);

  // Fetch Logs
  const fetchLogs = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setError(null);
    try {
      const params = {};
      if (filters.action) params.action = filters.action;
      if (filters.entity_type) params.entity_type = filters.entity_type;
      if (filters.severity) params.severity = filters.severity;
      if (filters.search) params.search = filters.search;
      params.limit = filters.limit;
      params.offset = filters.offset;

      const res = await getAuditLogs(params);
      if (res.success) {
        setLogs(res.data || []);
        const raw = res.pagination || {};
        const safeLimit = Number.isFinite(Number(raw.limit)) && Number(raw.limit) > 0 ? Number(raw.limit) : filters.limit || 25;
        const safeOffset = Number.isFinite(Number(raw.offset)) ? Number(raw.offset) : (filters.offset || 0);
        const safeTotal = Number.isFinite(Number(raw.total)) ? Number(raw.total) : 0;
        const safePage = Number.isFinite(Number(raw.page)) && Number(raw.page) > 0
          ? Number(raw.page)
          : Math.floor(safeOffset / safeLimit) + 1;
        const safeTotalPages = Number.isFinite(Number(raw.totalPages)) && Number(raw.totalPages) > 0
          ? Number(raw.totalPages)
          : Math.max(1, Math.ceil(safeTotal / safeLimit));

        setPagination({
          total: safeTotal,
          limit: safeLimit,
          offset: safeOffset,
          page: safePage,
          totalPages: safeTotalPages,
          has_more: raw.has_more ?? (safeOffset + safeLimit < safeTotal)
        });
      } else {
        setError(res.error || 'Failed to load audit records');
      }
    } catch (err) {
      setError(err.message || 'Audit service query failure');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchSummary();
    fetchLogs();
  }, [fetchSummary, fetchLogs]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
      fetchSummary();
    }, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs, fetchSummary]);

  // Select log for detail drawer
  const handleSelectLog = async (log) => {
    setSelectedLog(log);
    setDetailLoading(true);
    try {
      const res = await getAuditLogById(log.id);
      if (res.success) {
        setSelectedLogDetail(res.data);
      } else {
        setSelectedLogDetail(log);
      }
    } catch (err) {
      setSelectedLogDetail(log);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApplyPreset = (preset) => {
    setActivePreset(preset);
    let updated = { ...filters, offset: 0 };
    switch (preset) {
      case 'ROUTING_REVIEW':
        updated.entity_type = 'ROUTING_DECISION';
        updated.action = '';
        updated.severity = '';
        break;
      case 'SECURITY_DENIED':
        updated.action = 'AUTH_ACCESS_DENIED';
        updated.entity_type = '';
        updated.severity = '';
        break;
      case 'JURISDICTION':
        updated.entity_type = 'JURISDICTION';
        updated.action = '';
        updated.severity = '';
        break;
      case 'COMPLAINTS':
        updated.entity_type = 'COMPLAINT';
        updated.action = '';
        updated.severity = '';
        break;
      default:
        updated.action = '';
        updated.entity_type = '';
        updated.severity = '';
        updated.search = '';
        break;
    }
    setFilters(updated);
  };

  const handlePageChange = (newOffset) => {
    setFilters(prev => ({ ...prev, offset: Math.max(0, newOffset) }));
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">CRITICAL</span>;
      case 'WARNING':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">WARNING</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-300 border border-slate-600/50">INFO</span>;
    }
  };

  const getActionColor = (action) => {
    if (!action) return 'text-slate-300 bg-slate-800/60 border-slate-700';
    if (action.startsWith('AUTH_LOGIN_FAILED') || action.includes('DENIED') || action.includes('BREACHED')) {
      return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    }
    if (action.startsWith('AUTH_')) {
      return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
    }
    if (action.startsWith('ROUTING_')) {
      return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    }
    if (action.startsWith('REVIEW_')) {
      return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    }
    if (action.startsWith('JURISDICTION_')) {
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    }
    if (action.startsWith('COMPLAINT_')) {
      return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    }
    return 'text-slate-300 bg-slate-800/60 border-slate-700';
  };

  const currentLimit = Number(filters.limit) || Number(pagination.limit) || 25;
  const currentOffset = Number.isFinite(Number(filters.offset))
    ? Number(filters.offset)
    : (Number.isFinite(Number(pagination.offset)) ? Number(pagination.offset) : 0);
  const totalRecords = Number.isFinite(Number(pagination.total)) ? Number(pagination.total) : 0;
  const totalPages = Math.max(1, Number(pagination.totalPages) || Math.ceil(totalRecords / currentLimit) || 1);
  const currentPage = Math.min(
    Math.max(1, Number(pagination.page) || Math.floor(currentOffset / currentLimit) + 1),
    totalPages
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Overview Banner */}
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl backdrop-blur relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                IMMUTABLE AUDIT TRAIL
              </span>
              <span className="text-xs text-slate-400 font-mono">Stage 13 Core</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {isAdmin ? '👑 ADMIN: Full System Audit' : '🛡️ OPERATOR: Operational Audit Scope'}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-2 flex items-center gap-2">
              8-Section Operational Audit Dashboard
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              Append-only civic decision ledger backed by PostgreSQL immutability triggers. Every routing computation,
              human review action, boundary activation, and security event is permanently coupled to transactional provenance.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition ${
                autoRefresh 
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 shadow-sm' 
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <Activity className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-400' : ''}`} />
              {autoRefresh ? 'Live Stream (Active)' : 'Auto Refresh Off'}
            </button>
            <button
              onClick={() => { fetchLogs(true); fetchSummary(); }}
              disabled={refreshing}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: EXECUTIVE AUDIT METRICS                                       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 shadow-xl backdrop-blur relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Ledger Records</span>
            <Database className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white font-mono">
              {summary?.total_records ?? pagination.total ?? 0}
            </span>
            <span className="text-xs text-emerald-400 font-medium">Append-Only</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">PostgreSQL trigger protected (NO update/delete)</p>
        </div>

        {/* Metric 2 */}
        <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 shadow-xl backdrop-blur relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recent 24h Activity</span>
            <Clock className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-cyan-300 font-mono">
              {summary?.past_24h_records ?? logs.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">events</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Real-time civic transactions logged</p>
        </div>

        {/* Metric 3 */}
        <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 shadow-xl backdrop-blur relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Security & Denial Events</span>
            <ShieldAlert className="w-5 h-5 text-rose-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-rose-400 font-mono">
              {summary?.security_events ?? 0}
            </span>
            <span className="text-xs text-slate-400 font-medium">denials / alerts</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Unauthorized attempts & failed auth</p>
        </div>

        {/* Metric 4 */}
        <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 shadow-xl backdrop-blur relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Actors & Roles</span>
            <Users className="w-5 h-5 text-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-purple-300 font-mono">
              {summary?.unique_actors ?? 3}
            </span>
            <span className="text-xs text-purple-400 font-medium">actors</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Admin, Operator & Citizen interactions</p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: EVENT DISTRIBUTION & CATEGORY BREAKDOWN                       */}
      {/* ========================================================================= */}
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl backdrop-blur">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-cyan-400" />
          Section 2: Civic & Security Event Distribution
        </h3>

        {/* Category distribution badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-slate-950/60 border border-blue-500/20 rounded-lg p-3 text-center">
            <span className="text-[11px] font-bold text-blue-400 uppercase">Complaint</span>
            <p className="text-lg font-mono font-bold text-white mt-1">
              {summary?.by_category?.COMPLAINT || 0}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-cyan-500/20 rounded-lg p-3 text-center">
            <span className="text-[11px] font-bold text-cyan-400 uppercase">Routing</span>
            <p className="text-lg font-mono font-bold text-white mt-1">
              {summary?.by_category?.ROUTING || 0}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-amber-500/20 rounded-lg p-3 text-center">
            <span className="text-[11px] font-bold text-amber-400 uppercase">Review</span>
            <p className="text-lg font-mono font-bold text-white mt-1">
              {summary?.by_category?.REVIEW || 0}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-emerald-500/20 rounded-lg p-3 text-center">
            <span className="text-[11px] font-bold text-emerald-400 uppercase">Jurisdiction</span>
            <p className="text-lg font-mono font-bold text-white mt-1">
              {summary?.by_category?.JURISDICTION || 0}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-indigo-500/20 rounded-lg p-3 text-center">
            <span className="text-[11px] font-bold text-indigo-400 uppercase">SLA & Notify</span>
            <p className="text-lg font-mono font-bold text-white mt-1">
              {(summary?.by_category?.SLA || 0) + (summary?.by_category?.NOTIFICATION || 0)}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-purple-500/20 rounded-lg p-3 text-center">
            <span className="text-[11px] font-bold text-purple-400 uppercase">Authentication</span>
            <p className="text-lg font-mono font-bold text-white mt-1">
              {isAdmin ? (summary?.by_category?.AUTH || 0) : '—'}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-rose-500/20 rounded-lg p-3 text-center">
            <span className="text-[11px] font-bold text-rose-400 uppercase">Security</span>
            <p className="text-lg font-mono font-bold text-white mt-1">
              {isAdmin ? (summary?.by_category?.SECURITY || 0) : '—'}
            </p>
          </div>
        </div>

        {/* Visual proportion bar */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500" /> Complaint Lifecycle</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-cyan-500" /> PostGIS Routing</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-500" /> Human Review</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Boundary Activation</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-purple-500" /> Auth & Security</span>
          </div>
          <span className="text-slate-500 font-mono text-[11px]">Transactional Guarantee Active</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: SECURITY & ACCESS DENIAL MONITOR                              */}
      {/* ========================================================================= */}
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            Section 3: Security & Access Denial Monitor
          </h3>
          <span className="text-xs text-slate-400">
            {isAdmin ? 'Full Security Stream Visible (Admin Only)' : 'Restricted to System Administrators'}
          </span>
        </div>

        {isAdmin ? (
          <div className="bg-slate-950/80 border border-rose-950/60 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5" />
                Security Gateway Enforcement Log
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                AUTH_ACCESS_DENIED & AUTH_LOGIN_FAILED Monitor
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Authentication failures, role-based denials, and invalid token rejections are automatically isolated.
              Audit failure is non-blocking to preserve authentic 401/403 responses without 500 conversion.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="bg-slate-900/90 p-2.5 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Failed Login Privacy</span>
                <p className="text-xs text-emerald-400 font-medium mt-0.5">✓ Passwords/Tokens NEVER Stored</p>
              </div>
              <div className="bg-slate-900/90 p-2.5 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Recursion Prevention</span>
                <p className="text-xs text-emerald-400 font-medium mt-0.5">✓ Non-reentrant /api/audit check</p>
              </div>
              <div className="bg-slate-900/90 p-2.5 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Execution Context</span>
                <p className="text-xs text-emerald-400 font-medium mt-0.5">✓ Safe contextual metadata only</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 text-xs text-slate-400 flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <p className="text-slate-300 font-medium">Operational Visibility Scoped</p>
              <p className="text-slate-400 mt-0.5">
                Operator account role has access to operational domain logs (Complaints, Routing, Review, Jurisdictions).
                Security access denial records and authentication events are strictly restricted to System Administrators.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: AUDIT QUERY & FILTER TOOLBAR                                   */}
      {/* ========================================================================= */}
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl backdrop-blur space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Filter className="w-4 h-4 text-amber-400" />
            Section 4: Audit Query & Ledger Filter
          </h3>

          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => handleApplyPreset('ALL')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                activePreset === 'ALL' 
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 shadow-sm' 
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              All Events
            </button>
            <button
              onClick={() => handleApplyPreset('ROUTING_REVIEW')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                activePreset === 'ROUTING_REVIEW' 
                  ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 shadow-sm' 
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              Routing & Review
            </button>
            <button
              onClick={() => handleApplyPreset('JURISDICTION')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                activePreset === 'JURISDICTION' 
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-sm' 
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              Jurisdiction
            </button>
            <button
              onClick={() => handleApplyPreset('COMPLAINTS')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                activePreset === 'COMPLAINTS' 
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 shadow-sm' 
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              Complaints
            </button>
            {isAdmin && (
              <button
                onClick={() => handleApplyPreset('SECURITY_DENIED')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  activePreset === 'SECURITY_DENIED' 
                    ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40 shadow-sm' 
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                }`}
              >
                Security Denials
              </button>
            )}
          </div>
        </div>

        {/* Filter controls row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Action Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              Event Action
            </label>
            <select
              value={filters.action}
              onChange={(e) => {
                setActivePreset('CUSTOM');
                setFilters(prev => ({ ...prev, action: e.target.value, offset: 0 }));
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="">All Actions</option>
              <option value="COMPLAINT_CREATED">COMPLAINT_CREATED</option>
              <option value="COMPLAINT_STATUS_CHANGED">COMPLAINT_STATUS_CHANGED</option>
              <option value="ROUTING_EXECUTED">ROUTING_EXECUTED</option>
              <option value="ROUTING_HUMAN_REVIEW_REQUIRED">ROUTING_HUMAN_REVIEW_REQUIRED</option>
              <option value="ROUTING_MARKED_UNROUTABLE">ROUTING_MARKED_UNROUTABLE</option>
              <option value="REVIEW_STARTED">REVIEW_STARTED</option>
              <option value="REVIEW_RESOLVED">REVIEW_RESOLVED</option>
              <option value="JURISDICTION_DRAFT_CREATED">JURISDICTION_DRAFT_CREATED</option>
              <option value="JURISDICTION_VALIDATED">JURISDICTION_VALIDATED</option>
              <option value="JURISDICTION_ACTIVATED">JURISDICTION_ACTIVATED</option>
              <option value="SLA_WARNING">SLA_WARNING</option>
              <option value="SLA_BREACHED">SLA_BREACHED</option>
              <option value="NOTIFICATION_CREATED">NOTIFICATION_CREATED</option>
              {isAdmin && (
                <>
                  <option value="AUTH_LOGIN">AUTH_LOGIN</option>
                  <option value="AUTH_LOGIN_FAILED">AUTH_LOGIN_FAILED</option>
                  <option value="AUTH_LOGOUT">AUTH_LOGOUT</option>
                  <option value="AUTH_REGISTER">AUTH_REGISTER</option>
                  <option value="AUTH_ACCESS_DENIED">AUTH_ACCESS_DENIED</option>
                </>
              )}
            </select>
          </div>

          {/* Entity Type Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              Entity Type
            </label>
            <select
              value={filters.entity_type}
              onChange={(e) => {
                setActivePreset('CUSTOM');
                setFilters(prev => ({ ...prev, entity_type: e.target.value, offset: 0 }));
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="">All Entity Types</option>
              <option value="COMPLAINT">COMPLAINT</option>
              <option value="ROUTING_DECISION">ROUTING_DECISION</option>
              <option value="REVIEW">REVIEW</option>
              <option value="JURISDICTION">JURISDICTION</option>
              <option value="SLA">SLA</option>
              <option value="NOTIFICATION">NOTIFICATION</option>
              {isAdmin && (
                <>
                  <option value="USER">USER</option>
                  <option value="SECURITY">SECURITY</option>
                </>
              )}
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              Severity
            </label>
            <select
              value={filters.severity}
              onChange={(e) => {
                setActivePreset('CUSTOM');
                setFilters(prev => ({ ...prev, severity: e.target.value, offset: 0 }));
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="">All Severities</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              Ledger Search
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search action, ID, email..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value, offset: 0 }))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: IMMUTABLE EVENT STREAM TABLE                                   */}
      {/* ========================================================================= */}
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl shadow-xl backdrop-blur overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              Section 5: Immutable Event Stream Ledger
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-mono">
              {totalRecords} records found
            </span>
          </div>

          <span className="text-xs text-slate-500 font-mono">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {error ? (
          <div className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
            <p className="text-sm text-rose-300 font-medium">Error loading audit records</p>
            <p className="text-xs text-slate-500 mt-1">{error}</p>
          </div>
        ) : loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
            <p className="text-xs">Querying PostgreSQL immutable audit ledger...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Database className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="text-sm text-slate-300 font-medium">No audit events match your criteria</p>
            <p className="text-xs text-slate-500 mt-1">Try broadening your search or resetting filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3 px-4">Timestamp (UTC)</th>
                  <th className="py-3 px-4">Event Action</th>
                  <th className="py-3 px-4">Entity Reference</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Sanitized Execution Context</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.map((log) => {
                  const actionClass = getActionColor(log.action);
                  const isSecurity = log.action.includes('DENIED') || log.action.includes('FAILED');
                  const executionContext = log.metadata?.sanitized_context || {};
                  const contextSummary = log.ip_address 
                    ? `${executionContext.method || 'EVENT'} ${executionContext.path || ''} [${log.ip_address}]`
                    : executionContext.method 
                      ? `${executionContext.method} ${executionContext.path || ''}` 
                      : 'INTERNAL_TRANSACTION';

                  return (
                    <tr
                      key={log.id}
                      onClick={() => handleSelectLog(log)}
                      className={`hover:bg-slate-800/40 transition cursor-pointer ${
                        selectedLog?.id === log.id ? 'bg-amber-950/20' : ''
                      }`}
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                        <div>{new Date(log.created_at).toLocaleTimeString()}</div>
                        <div className="text-[10px] text-slate-500">{new Date(log.created_at).toLocaleDateString()}</div>
                      </td>

                      {/* Event Action */}
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${actionClass}`}>
                          {log.action}
                        </span>
                      </td>

                      {/* Entity Reference */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{log.entity_type}</div>
                        <div className="font-mono text-[10px] text-slate-500 truncate max-w-[140px]" title={log.entity_id}>
                          {log.entity_id ? log.entity_id.substring(0, 16) + '...' : '—'}
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-slate-300 font-medium">{log.actor_email || 'SYSTEM_DAEMON'}</div>
                        <span className="inline-block px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                          {log.actor_role || 'SYSTEM'}
                        </span>
                      </td>

                      {/* Severity */}
                      <td className="py-3 px-4">
                        {getSeverityBadge(log.severity)}
                      </td>

                      {/* Sanitized Execution Context */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 max-w-[200px] truncate" title={contextSummary}>
                        {contextSummary}
                      </td>

                      {/* Inspect Button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectLog(log);
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700 transition"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 6: EVENT DETAIL DRAWER / CONTEXT INSPECTOR (MODAL / OVERLAY)     */}
      {/* ========================================================================= */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/75 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-[#0d1424] border border-slate-800/90 rounded-2xl w-full max-w-2xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0a0f1e]/90 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${getActionColor(selectedLog.action)}`}>
                  {selectedLog.action}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  ID: {selectedLog.id.substring(0, 8)}...
                </span>
              </div>
              <button
                onClick={() => { setSelectedLog(null); setSelectedLogDetail(null); }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Event Overview Card */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Timestamp (UTC)</span>
                  <p className="font-mono text-slate-200 mt-0.5">{selectedLog.created_at}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Severity Level</span>
                  <div className="mt-0.5">{getSeverityBadge(selectedLog.severity)}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Entity Type</span>
                  <p className="font-semibold text-white mt-0.5">{selectedLog.entity_type}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Entity ID</span>
                  <p className="font-mono text-amber-300 mt-0.5 truncate">{selectedLog.entity_id || 'N/A'}</p>
                </div>
              </div>

              {/* Actor Identity */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase">
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  Actor Provenance
                </h4>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-500">Actor Email</span>
                    <p className="font-mono text-slate-200">{selectedLog.actor_email || 'SYSTEM'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Actor Role</span>
                    <p className="font-bold text-slate-200">{selectedLog.actor_role || 'SYSTEM'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">User UUID</span>
                    <p className="font-mono text-slate-400 truncate">{selectedLog.user_id || 'SYSTEM_TRANSACTION'}</p>
                  </div>
                </div>
              </div>

              {/* Sanitized Execution Context */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    Sanitized Execution Context
                  </h4>
                  <span className="text-[10px] text-emerald-400 font-mono">No sensitive headers / tokens</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-500">HTTP Method</span>
                    <p className="font-mono text-cyan-300 font-bold">
                      {selectedLog.metadata?.sanitized_context?.method || 'INTERNAL'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Request Path</span>
                    <p className="font-mono text-slate-300 truncate">
                      {selectedLog.metadata?.sanitized_context?.path || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Client IP Address</span>
                    <p className="font-mono text-slate-300">
                      {selectedLog.ip_address || selectedLog.metadata?.sanitized_context?.ip || '127.0.0.1'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] text-slate-500">Client User-Agent</span>
                    <p className="font-mono text-slate-400 truncate text-[11px]">
                      {selectedLog.user_agent || selectedLog.metadata?.sanitized_context?.userAgent || 'Internal API Client'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">HTTP Status Code</span>
                    <p className="font-mono text-emerald-400 font-bold">
                      {selectedLog.metadata?.sanitized_context?.statusCode || '200'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Event Metadata JSON Payload */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  Payload Metadata (Sanitized)
                </h4>
                <pre className="bg-slate-900 p-3 rounded-lg text-slate-300 font-mono text-[11px] overflow-x-auto max-h-56 border border-slate-800">
                  {JSON.stringify(selectedLogDetail?.metadata || selectedLog.metadata || {}, null, 2)}
                </pre>
              </div>

              {/* Immutability Verification Notice */}
              <div className="bg-amber-950/20 border border-amber-500/30 p-3 rounded-xl flex items-center gap-3">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-[11px] text-amber-200">
                  This record is permanently sealed in the database. PostgreSQL immutability triggers reject any UPDATE or DELETE attempt.
                </p>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => { setSelectedLog(null); setSelectedLogDetail(null); }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 7: IMMUTABILITY & TAMPER-PROOF ASSURANCE BADGE                    */}
      {/* ========================================================================= */}
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl backdrop-blur">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Section 7: PostgreSQL Database Immutability Guarantees
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="text-[11px] font-bold text-emerald-400 uppercase flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              INSERT Allowed
            </span>
            <p className="text-slate-300 mt-1">
              Append-only inserts permitted for authorized transaction services and system audit operations.
            </p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="text-[11px] font-bold text-rose-400 uppercase flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-rose-400" />
              UPDATE Strictly Rejected
            </span>
            <p className="text-slate-300 mt-1">
              PostgreSQL trigger <code className="text-amber-400">trg_audit_logs_immutable</code> throws SQLSTATE 23505 on any row update.
            </p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="text-[11px] font-bold text-rose-400 uppercase flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-rose-400" />
              DELETE Strictly Rejected
            </span>
            <p className="text-slate-300 mt-1">
              Historical records cannot be pruned or deleted. Preserves historical audit records for legal & operational integrity.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 8: PAGINATION CONTROLS                                            */}
      {/* ========================================================================= */}
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-4 shadow-xl backdrop-blur flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>Section 8: Page Size:</span>
          <select
            value={filters.limit}
            onChange={(e) => setFilters(prev => ({ ...prev, limit: Number(e.target.value), offset: 0 }))}
            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value={10}>10 records</option>
            <option value={25}>25 records</option>
            <option value={50}>50 records</option>
            <option value={100}>100 records</option>
          </select>
          <span>
            Showing {logs.length > 0 ? currentOffset + 1 : 0} to {Math.min(currentOffset + currentLimit, totalRecords)} of {totalRecords} entries
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(currentOffset - currentLimit)}
            disabled={currentOffset === 0 || currentPage <= 1}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-40 disabled:pointer-events-none border border-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentOffset + currentLimit)}
            disabled={currentPage >= totalPages || (!pagination.has_more && currentOffset + currentLimit >= totalRecords)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-40 disabled:pointer-events-none border border-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
