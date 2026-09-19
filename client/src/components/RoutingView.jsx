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

  const loadDecisions = async () => {
    setLoading(true);
    const res = await getRoutingDecisions(50, 0);
    if (res.success && res.data) {
      setDecisions(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDecisions();
  }, []);

  // Listen for real-time routing events
  useEffect(() => {
    const handleRoutingCompleted = (data) => {
      // Re-fetch or prepend normalized decision
      loadDecisions();
    };
    const handleRoutingReview = (data) => {
      loadDecisions();
    };

    socket.on('routing:completed', handleRoutingCompleted);
    socket.on('routing:review_required', handleRoutingReview);

    return () => {
      socket.off('routing:completed', handleRoutingCompleted);
      socket.off('routing:review_required', handleRoutingReview);
    };
  }, []);

  const filteredDecisions = decisions.filter((d) => {
    const status = d.routing_status || d.routingStatus;
    if (filterStatus !== 'ALL' && status !== filterStatus) return false;
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
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-lg flex items-center gap-4">
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/30">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Total Processed</span>
            <span className="text-2xl font-bold text-white font-mono">{totalDecisions}</span>
            <span className="text-[10px] text-slate-500 block">Deterministic Routing</span>
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-lg flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/30">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">PostGIS Resolved</span>
            <span className="text-2xl font-bold text-emerald-400 font-mono">{routedCount}</span>
            <span className="text-[10px] text-slate-500 block">Containment Match</span>
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-lg flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/30">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Human Review</span>
            <span className="text-2xl font-bold text-amber-400 font-mono">{reviewCount}</span>
            <span className="text-[10px] text-slate-500 block">No Invented Authority</span>
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-lg flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/30">
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
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/30">
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
            <div className="relative flex-1 sm:w-60">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search code, authority..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-2.5 py-1 rounded transition ${filterStatus === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('ROUTED')}
                className={`px-2.5 py-1 rounded transition ${filterStatus === 'ROUTED' ? 'bg-emerald-900/60 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Routed
              </button>
              <button
                onClick={() => setFilterStatus('HUMAN_REVIEW')}
                className={`px-2.5 py-1 rounded transition ${filterStatus === 'HUMAN_REVIEW' ? 'bg-amber-900/60 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Review
              </button>
            </div>

            <button
              onClick={loadDecisions}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
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
                  className="p-4 bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 rounded-xl transition space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">
                        {complaintCode}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                        {category}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border flex items-center gap-1 ${
                        isRouted
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-950 text-amber-400 border-amber-500/30'
                      }`}>
                        {isRouted ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formattedDate}
                      </span>
                      <button
                        onClick={() => setSelectedDecision(d)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium flex items-center gap-1 transition border border-slate-700"
                      >
                        <Info className="w-3.5 h-3.5 text-cyan-400" />
                        Details
                      </button>
                    </div>
                  </div>

                  {/* Routing Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block">Authority</span>
                      <span className="font-semibold text-slate-200">
                        {authorityName}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block">Department</span>
                      <span className="font-semibold text-slate-200">
                        {departmentName}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block">Jurisdiction Zone</span>
                      <span className="text-slate-300">
                        {jurisdictionName}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block">Jurisdiction Version</span>
                      <span className="font-mono text-cyan-300">
                        {versionCode}
                      </span>
                    </div>
                  </div>

                  {/* Dynamic Explanation Quote */}
                  <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800/80 text-xs font-mono text-slate-300 leading-relaxed">
                    <span className="text-[10px] text-slate-500 block uppercase mb-0.5">Spatial Reason:</span>
                    "{reasonText}"
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal */}
      {selectedDecision && (
        <RoutingDecisionModal
          decision={selectedDecision}
          complaint={{ complaint_code: selectedDecision.complaint_code }}
          onClose={() => setSelectedDecision(null)}
        />
      )}
    </div>
  );
}
