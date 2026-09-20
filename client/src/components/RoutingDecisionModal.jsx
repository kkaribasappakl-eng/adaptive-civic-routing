import React from 'react';
import { X, CheckCircle2, AlertTriangle, Building2, Layers, Compass, FileText, Cpu, Clock, ShieldCheck } from 'lucide-react';
import {
  getDecisionAuthority,
  getDecisionDepartment,
  getDecisionJurisdiction,
  getDecisionVersion,
  getDecisionReason,
  getDecisionTimestamp,
  isOutsideBoundaryDecision
} from '../services/routingDisplay';

export default function RoutingDecisionModal({ decision, complaint, onClose }) {
  if (!decision && !complaint) return null;

  const status = decision?.routing_status || decision?.routingStatus || 'PENDING';
  const isRouted = status === 'ROUTED';
  const isAwaiting = status === 'AWAITING_ROUTING' || status === 'PENDING' || status === 'SUBMITTED';
  const isReview = status === 'HUMAN_REVIEW' || status === 'UNROUTABLE';
  const isOutside = isOutsideBoundaryDecision(decision);

  const complaintCode = complaint?.complaint_code || complaint?.complaintCode || decision?.complaint_code || decision?.complaintCode || 'N/A';
  const authorityName = getDecisionAuthority(decision);
  const departmentName = getDecisionDepartment(decision);
  const jurisdictionName = getDecisionJurisdiction(decision);
  const versionCode = getDecisionVersion(decision);
  const reasonText = getDecisionReason(decision);
  const formattedDate = getDecisionTimestamp(decision);
  const routingMethod = decision?.routing_method || decision?.routingMethod || (isAwaiting ? 'PENDING' : 'DETERMINISTIC_GIS');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isRouted 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                : isAwaiting
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
            }`}>
              {isRouted ? <CheckCircle2 className="w-5 h-5" /> : isAwaiting ? <Clock className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Routing Audit Record
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border ${
                  isRouted 
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-500/40' 
                    : isAwaiting
                      ? 'bg-cyan-950 text-cyan-400 border-cyan-500/40'
                      : 'bg-amber-950 text-amber-400 border-amber-500/40'
                }`}>
                  {isAwaiting ? 'Awaiting Routing' : status}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Complaint: {complaintCode}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Status Banner */}
          <div className={`p-4 rounded-xl border flex items-start gap-3.5 ${
            isRouted 
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
              : isAwaiting
                ? 'bg-cyan-950/20 border-cyan-500/30 text-cyan-300'
                : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
          }`}>
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-semibold block text-sm">
                {isRouted 
                  ? 'Deterministically Routed via PostGIS' 
                  : isAwaiting
                    ? 'Complaint Registered — Awaiting Routing'
                    : (isOutside ? 'Outside Boundaries — Human Review Required' : 'Human Review Required')}
              </span>
              <p className="text-slate-300 leading-relaxed">
                {isRouted 
                  ? 'Spatial containment confirmed by PostgreSQL/PostGIS. Department resolved via active database mapping.' 
                  : isAwaiting
                    ? 'Complaint is recorded in PostgreSQL. Routing assignment is pending deterministic GIS processing or operator action.'
                    : (isOutside
                      ? 'Coordinates are outside active municipal boundaries. Flagged for civic officer review without inventing jurisdiction.'
                      : 'Complaint location requires operator review (e.g. unmapped category or manual policy review).')}
              </p>
            </div>
          </div>

          {/* Core Decision Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-civic-400" />
                Responsible Authority
              </span>
              <p className="font-bold text-slate-100 text-sm">
                {authorityName}
              </p>
              {(decision?.authority?.code || decision?.authority_code) && (
                <span className="text-[10px] font-mono text-slate-500">{decision?.authority?.code || decision?.authority_code}</span>
              )}
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                Assigned Department
              </span>
              <p className="font-bold text-slate-100 text-sm">
                {departmentName}
              </p>
              {(decision?.department?.code || decision?.department_code) && (
                <span className="text-[10px] font-mono text-slate-500">{decision?.department?.code || decision?.department_code}</span>
              )}
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                Covering Jurisdiction
              </span>
              <p className="font-medium text-slate-200">
                {jurisdictionName}
              </p>
              {(decision?.jurisdiction?.code || decision?.jurisdiction_code) && (
                <span className="text-[10px] font-mono text-slate-500">{decision?.jurisdiction?.code || decision?.jurisdiction_code}</span>
              )}
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Jurisdiction Version
              </span>
              <p className="font-mono font-semibold text-slate-200">
                {versionCode}
              </p>
              <span className="text-[10px] text-slate-500 block">Immutable Record Binding</span>
            </div>
          </div>

          {/* Dynamic Explainable Routing Reason */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              Dynamic Explainable Routing Reason
            </span>
            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-200 font-mono leading-relaxed">
              "{reasonText}"
            </div>
          </div>

          {/* Metadata Footer */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono border-t border-slate-800 pt-3">
            <span className="flex items-center gap-1">
              Method: <strong className="text-slate-300">{routingMethod}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formattedDate}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
}
