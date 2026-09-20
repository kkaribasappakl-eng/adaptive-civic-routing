import React, { useState, useEffect } from 'react';
import {
  Compass,
  Cpu,
  RefreshCw,
  Building2,
  FileText,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  Zap,
  Clock,
  MapPin,
  Search
} from 'lucide-react';
import { getRoutingDecisions } from '../services/api';
import socket from '../services/socket';
import RoutingDecisionModal from './RoutingDecisionModal';
import {
  getDecisionAuthority,
  getDecisionDepartment,
  getDecisionJurisdiction,
  getDecisionVersion,
  getDecisionReason,
  getDecisionTimestamp
} from '../services/routingDisplay';

export default function RoutingView() {
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDecision, setSelectedDecision] = useState(null);

  const loadDecisions = async (term = searchTerm) => {
    setLoading(true);
    const res = await getRoutingDecisions(50, 0, term ? term.trim() : null);
    if (res.success && res.data) {
      setDecisions(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDecisions(searchTerm);
    }, searchTerm ? 300 : 0);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Listen for real-time routing events and new complaint intake
  useEffect(() => {
    const handleRoutingCompleted = (data) => {
      if (data && (data.complaintCode || data.complaint_code || data.complaintId)) {
        const code = data.complaintCode || data.complaint_code;
        const id = data.complaintId || data.complaint_id;
        setDecisions((prev) =>
          prev.map((d) => {
            const matches = (code && (d.complaint_code === code || d.complaintCode === code)) ||
                            (id && (d.complaint_id === id || d.complaintId === id || d.id === id));
            if (matches) {
              return {
                ...d,
                routing_status: data.routingStatus || 'ROUTED',
                routing_method: data.routingMethod || 'GIS_RULE',
                authority_name: data.authorityName || data.authority,
                department_name: data.departmentName || data.department,
                jurisdiction_name: data.jurisdictionName || data.jurisdiction,
                version_code: data.jurisdictionVersion || data.versionCode,
                reason: data.reason
              };
            }
            return d;
          })
        );
      }
      loadDecisions(searchTerm);
    };

    const handleRoutingReview = (data) => {
      if (data && (data.complaintCode || data.complaint_code || data.complaintId)) {
        const code = data.complaintCode || data.complaint_code;
        const id = data.complaintId || data.complaint_id;
        setDecisions((prev) =>
          prev.map((d) => {
            const matches = (code && (d.complaint_code === code || d.complaintCode === code)) ||
                            (id && (d.complaint_id === id || d.complaintId === id || d.id === id));
            if (matches) {
              return {
                ...d,
                routing_status: data.routingStatus || 'HUMAN_REVIEW',
                routing_method: data.routingMethod || 'HUMAN_REVIEW',
                authority_name: data.authorityName || data.authority || null,
                department_name: data.departmentName || data.department || null,
                jurisdiction_name: data.jurisdictionName || data.jurisdiction || null,
                version_code: data.jurisdictionVersion || data.versionCode || null,
                reason: data.reason
              };
            }
            return d;
          })
        );
      }
      loadDecisions(searchTerm);
    };

    const handleComplaintCreated = (newComplaint) => {
      const code = newComplaint.complaintCode || newComplaint.complaint_code;
      const isAlreadyRouted = newComplaint.status === 'ROUTED' || newComplaint.routing_status === 'ROUTED';
      const isAlreadyReview = newComplaint.status === 'HUMAN_REVIEW' || newComplaint.routing_status === 'HUMAN_REVIEW';

      const initialRecord = {
        id: `pending-${newComplaint.id || code}`,
        complaint_id: newComplaint.id,
        complaint_code: code,
        category: newComplaint.category,
        complaint_status: newComplaint.status || 'SUBMITTED',
        routing_status: isAlreadyRouted ? 'ROUTED' : (isAlreadyReview ? 'HUMAN_REVIEW' : 'AWAITING_ROUTING'),
        routing_method: isAlreadyRouted ? 'GIS_RULE' : (isAlreadyReview ? 'HUMAN_REVIEW' : 'PENDING'),
        reason: isAlreadyRouted 
          ? 'Complaint deterministically routed via PostGIS.' 
          : (isAlreadyReview ? 'Complaint flagged for human review.' : 'Complaint registered and awaiting routing assignment.'),
        created_at: newComplaint.createdAt || newComplaint.created_at || new Date().toISOString(),
        authority_name: null,
        department_name: null,
        jurisdiction_name: null,
        version_code: null
      };

      setDecisions((prev) => [
        initialRecord,
        ...prev.filter((d) => (d.complaint_code || d.complaintCode) !== code)
      ]);

      // If already routed or reviewing, fetch full decision right away
      if (isAlreadyRouted || isAlreadyReview) {
        loadDecisions(searchTerm);
      }
    };

    const handleStatusChanged = () => {
      loadDecisions(searchTerm);
    };

    socket.on('routing:completed', handleRoutingCompleted);
    socket.on('routing:review_required', handleRoutingReview);
    socket.on('complaint:created', handleComplaintCreated);
    socket.on('complaint:status_changed', handleStatusChanged);

    return () => {
      socket.off('routing:completed', handleRoutingCompleted);
      socket.off('routing:review_required', handleRoutingReview);
      socket.off('complaint:created', handleComplaintCreated);
      socket.off('complaint:status_changed', handleStatusChanged);
    };
  }, [searchTerm]);

  const filteredDecisions = decisions.filter((d) => {
    const status = d.routing_status || d.routingStatus;
    if (filterStatus === 'ROUTED' && status !== 'ROUTED') return false;
    if (filterStatus === 'HUMAN_REVIEW' && status !== 'HUMAN_REVIEW' && status !== 'UNROUTABLE') return false;
    if (filterStatus === 'AWAITING' && status !== 'AWAITING_ROUTING' && status !== 'PENDING' && status !== 'SUBMITTED') return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const codeMatch = (d.complaint_code || d.complaintCode || '').toLowerCase().includes(term);
      const authMatch = getDecisionAuthority(d).toLowerCase().includes(term);
      const deptMatch = getDecisionDepartment(d).toLowerCase().includes(term);
      const jurMatch = getDecisionJurisdiction(d).toLowerCase().includes(term);
      const catMatch = (d.category || '').toLowerCase().includes(term);
      const verMatch = getDecisionVersion(d).toLowerCase().includes(term);
      return codeMatch || authMatch || deptMatch || jurMatch || catMatch || verMatch;
    }
    return true;
  });

  const totalDecisions = decisions.length;
  const routedCount = decisions.filter((d) => (d.routing_status || d.routingStatus) === 'ROUTED').length;
  const reviewCount = decisions.filter((d) => {
    const s = d.routing_status || d.routingStatus;
    return s === 'HUMAN_REVIEW' || s === 'UNROUTABLE';
  }).length;

  return (
    <div className="space-y-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl shadow-xl flex items-center gap-4 backdrop-blur">
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/30 shadow-inner">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Total Processed</span>
            <span className="text-2xl font-bold text-white font-mono">{totalDecisions}</span>
            <span className="text-[10px] text-slate-500 block">Deterministic Routing</span>
          </div>
        </div>

        <div className="p-5 bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl shadow-xl flex items-center gap-4 backdrop-blur">
          <div className="p-3 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/30 shadow-inner">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">PostGIS Resolved</span>
            <span className="text-2xl font-bold text-teal-400 font-mono">{routedCount}</span>
            <span className="text-[10px] text-slate-500 block">Containment Match</span>
          </div>
        </div>

        <div className="p-5 bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl shadow-xl flex items-center gap-4 backdrop-blur">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/30 shadow-inner">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Human Review</span>
            <span className="text-2xl font-bold text-amber-400 font-mono">{reviewCount}</span>
            <span className="text-[10px] text-slate-500 block">No Invented Authority</span>
          </div>
        </div>

        <div className="p-5 bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl shadow-xl flex items-center gap-4 backdrop-blur">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/30 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Immutability</span>
            <span className="text-sm font-bold text-indigo-300 font-mono">100% Guaranteed</span>
            <span className="text-[10px] text-slate-500 block">Historical Version Lock</span>
          </div>
        </div>
      </div>

      {/* Main Decisions Audit Log */}
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4 backdrop-blur">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/30">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Routing Audit Trail & Decision Ledger
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Persisted PostgreSQL decisions with dynamic spatial proofs
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search code, authority..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#070b16] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 font-mono"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-1 bg-[#070b16] p-1 rounded-xl border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-3 py-1 rounded-lg transition ${filterStatus === 'ALL' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('ROUTED')}
                className={`px-3 py-1 rounded-lg transition ${filterStatus === 'ROUTED' ? 'bg-teal-950/80 text-teal-300 border border-teal-500/40 shadow' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Routed
              </button>
              <button
                onClick={() => setFilterStatus('HUMAN_REVIEW')}
                className={`px-3 py-1 rounded-lg transition ${filterStatus === 'HUMAN_REVIEW' ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40 shadow' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Review
              </button>
              <button
                onClick={() => setFilterStatus('AWAITING')}
                className={`px-3 py-1 rounded-lg transition ${filterStatus === 'AWAITING' ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Awaiting
              </button>
            </div>

            <button
              onClick={() => loadDecisions(searchTerm)}
              disabled={loading}
              className="p-2 bg-slate-800/80 hover:bg-slate-750 text-slate-300 rounded-xl border border-slate-750 transition"
              title="Refresh decisions"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table / List View */}
        <div className="space-y-3">
          {loading && decisions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-mono">
              Loading routing decisions ledger...
            </div>
          ) : filteredDecisions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-mono">
              No matching routing decisions recorded yet.
            </div>
          ) : (
            filteredDecisions.map((d) => {
              const status = d.routing_status || d.routingStatus || 'PENDING';
              const isRouted = status === 'ROUTED';
              const isAwaiting = status === 'AWAITING_ROUTING' || status === 'PENDING' || status === 'SUBMITTED';
              const complaintCode = d.complaint_code || d.complaintCode || 'N/A';
              const category = d.category || 'N/A';
              const authorityName = getDecisionAuthority(d);
              const departmentName = getDecisionDepartment(d);
              const jurisdictionName = getDecisionJurisdiction(d);
              const versionCode = getDecisionVersion(d);
              const reasonText = getDecisionReason(d);
              const formattedDate = getDecisionTimestamp(d);

              return (
                <div
                  key={d.id}
                  className="p-4 bg-[#070b16]/80 border border-slate-800/90 hover:border-slate-700 rounded-xl transition-all duration-150 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">
                        {complaintCode}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-800/90 text-slate-300 border border-slate-700/80">
                        {category}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border flex items-center gap-1 ${
                        isRouted
                          ? 'bg-teal-950/80 text-teal-300 border-teal-500/40'
                          : isAwaiting
                            ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'
                            : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                      }`}>
                        {isRouted ? <CheckCircle2 className="w-3 h-3" /> : isAwaiting ? <Clock className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {isAwaiting ? 'Awaiting Routing' : status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formattedDate}
                      </span>
                      <button
                        onClick={() => setSelectedDecision(d)}
                        className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-750 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition border border-slate-700"
                      >
                        <Info className="w-3.5 h-3.5 text-teal-400" />
                        <span>Proof Details</span>
                      </button>
                    </div>
                  </div>

                  {/* Decision metadata details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/60 text-xs">
                    <div className="p-2.5 bg-[#0b1020]/90 rounded-lg border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Assigned Authority</span>
                      <span className="font-semibold text-slate-200 block truncate">
                        {authorityName || (isAwaiting ? 'Pending calculation' : 'Unassigned')}
                      </span>
                    </div>

                    <div className="p-2.5 bg-[#0b1020]/90 rounded-lg border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Department</span>
                      <span className="font-semibold text-slate-200 block truncate">
                        {departmentName || (isAwaiting ? 'Pending calculation' : 'Human Review')}
                      </span>
                    </div>

                    <div className="p-2.5 bg-[#0b1020]/90 rounded-lg border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Jurisdiction Zone</span>
                      <span className="text-slate-300 block truncate">
                        {jurisdictionName || (isAwaiting ? 'Pending containment' : 'None (Outside)')}
                      </span>
                    </div>

                    <div className="p-2.5 bg-[#0b1020]/90 rounded-lg border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Bound Version</span>
                      <span className="font-mono text-cyan-300 block truncate">
                        {versionCode || (isAwaiting ? 'Active V1' : 'None')}
                      </span>
                    </div>
                  </div>

                  {/* Justification note */}
                  {reasonText && (
                    <div className="text-[11px] text-slate-400 bg-[#0b1020]/60 p-2.5 rounded-lg border border-slate-800/60 font-mono">
                      <span className="text-slate-500 uppercase font-semibold text-[10px] mr-1.5">Rule Proof:</span>
                      {reasonText}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Decision Detail & Spatial Proof Modal */}
      {selectedDecision && (
        <RoutingDecisionModal
          decision={selectedDecision}
          complaint={{
            complaint_code: selectedDecision.complaint_code || selectedDecision.complaintCode,
            category: selectedDecision.category,
            description: selectedDecision.description || 'Civic intake record'
          }}
          onClose={() => setSelectedDecision(null)}
        />
      )}
    </div>
  );
}
