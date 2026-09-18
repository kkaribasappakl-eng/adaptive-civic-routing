import React, { useState, useEffect } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  RefreshCw,
  History,
  Timer,
  Info,
  Calendar,
  Zap
} from 'lucide-react';
import { getComplaintSla, evaluateComplaintSla } from '../services/api';

/**
 * Stage 7: SlaStatusCard
 * Displays real PostgreSQL-backed SLA tracking, target/warning windows,
 * remaining time countdown, SLA policy benchmark, and append-only audit event history.
 */
export default function SlaStatusCard({ complaintId, complaintStatus, onSlaUpdated }) {
  const [slaData, setSlaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [evalNotice, setEvalNotice] = useState('');

  const fetchSla = async () => {
    if (!complaintId) return;
    setLoading(true);
    setErrorMessage('');
    const res = await getComplaintSla(complaintId);
    if (res.success && res.data) {
      setSlaData(res.data);
    } else {
      setErrorMessage(res.error || 'Failed to fetch SLA tracking data');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSla();
  }, [complaintId]);

  const handleEvaluate = async (simulatedIso = null) => {
    setEvaluating(true);
    setEvalNotice('');
    setErrorMessage('');
    const res = await evaluateComplaintSla(complaintId, simulatedIso);
    setEvaluating(false);

    if (res.success && res.data) {
      if (res.data.statusChanged) {
        setEvalNotice(`SLA status updated to: ${res.data.slaStatus}`);
      } else {
        setEvalNotice(`Evaluated against PostgreSQL: Status remains ${res.data.slaStatus}`);
      }
      setTimeout(() => setEvalNotice(''), 4000);
      fetchSla();
      if (onSlaUpdated) onSlaUpdated(res.data);
    } else {
      setErrorMessage(res.error || 'Evaluation failed');
    }
  };

  if (loading && !slaData) {
    return (
      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-500 font-mono flex items-center justify-center gap-2">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-civic-400" />
        Loading SLA Tracking Data...
      </div>
    );
  }

  if (!slaData && errorMessage) {
    return (
      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 font-mono flex items-center gap-2">
        <Info className="w-4 h-4 text-slate-500" />
        <span>SLA tracking pending (case must be routed to initialize SLA).</span>
      </div>
    );
  }

  const {
    slaStatus = 'WITHIN_SLA',
    targetHours,
    warningHours,
    slaPolicyDescription,
    routedAt,
    slaWarningAt,
    slaTargetAt,
    slaBreachedAt,
    remainingHours,
    remainingMinutes,
    isOverdue,
    overdueHours,
    isClosed,
    events = []
  } = slaData || {};

  // Status visual configurations
  const statusConfig = {
    WITHIN_SLA: {
      label: 'WITHIN SLA',
      badgeBg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
      icon: CheckCircle2,
      accentColor: 'text-emerald-400',
      borderColor: 'border-emerald-900/40'
    },
    AT_RISK: {
      label: 'AT RISK (WARNING)',
      badgeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-400 animate-pulse',
      icon: AlertTriangle,
      accentColor: 'text-amber-400',
      borderColor: 'border-amber-900/50'
    },
    SLA_BREACHED: {
      label: 'SLA BREACHED',
      badgeBg: 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold',
      icon: XCircle,
      accentColor: 'text-rose-400',
      borderColor: 'border-rose-900/60'
    }
  };

  const currentConf = statusConfig[slaStatus] || statusConfig.WITHIN_SLA;
  const StatusIcon = currentConf.icon;

  const formatDate = (iso) => {
    if (!iso) return 'Not set';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className={`p-4 bg-slate-950 rounded-xl border ${currentConf.borderColor} space-y-4`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
            <Timer className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-200 block">
              SLA Tracking & Escalation
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Demo SLA Policy • PostgreSQL Timestamps
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono border flex items-center gap-1.5 ${currentConf.badgeBg}`}>
            <StatusIcon className="w-3 h-3" />
            {currentConf.label}
          </span>
          <button
            onClick={() => fetchSla()}
            disabled={loading}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-900 transition"
            title="Refresh SLA details"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Eval notice / Error message */}
      {evalNotice && (
        <div className="p-2.5 bg-cyan-950/40 border border-cyan-500/40 rounded-lg text-xs text-cyan-300 font-mono flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>{evalNotice}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-2.5 bg-rose-950/40 border border-rose-500/40 rounded-lg text-xs text-rose-300 font-mono flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Closure / Resolution Protection Banner */}
      {isClosed && (
        <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-300 font-mono flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Closed Case Protection: Case resolved/closed before breach. SLA state is immutable against retroactive breach.
          </span>
        </div>
      )}

      {/* Benchmark Windows Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
        {/* Routed At Baseline */}
        <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800/80">
          <span className="text-[10px] text-slate-400 block uppercase tracking-wider mb-1">
            Routing Baseline
          </span>
          <span className="text-slate-200 font-medium block">
            {formatDate(routedAt)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Real DB Timestamp
          </span>
        </div>

        {/* Warning Threshold */}
        <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800/80">
          <span className="text-[10px] text-amber-400/90 block uppercase tracking-wider mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> Warning ({warningHours || '—'}h)
          </span>
          <span className="text-slate-200 font-medium block">
            {formatDate(slaWarningAt)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Escalation Threshold
          </span>
        </div>

        {/* Target Deadline */}
        <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800/80">
          <span className="text-[10px] text-cyan-400 block uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-cyan-400" /> Target ({targetHours || '—'}h)
          </span>
          <span className="text-slate-200 font-medium block">
            {formatDate(slaTargetAt)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Resolution Deadline
          </span>
        </div>
      </div>

      {/* Remaining Time / Breach Indicator */}
      <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-mono">
            Elapsed Window Analysis
          </span>
          {isClosed ? (
            <span className="font-semibold text-emerald-400 font-mono">
              Remediated within SLA window
            </span>
          ) : isOverdue ? (
            <span className="font-semibold text-rose-400 font-mono flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" />
              Overdue by {overdueHours} hours
            </span>
          ) : remainingHours !== null ? (
            <span className="font-semibold text-slate-200 font-mono flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              {remainingHours}h {remainingMinutes}m remaining before target
            </span>
          ) : (
            <span className="text-slate-400 font-mono">Awaiting routing timestamp</span>
          )}
        </div>

        {/* Manual Evaluation Trigger */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEvaluate()}
            disabled={evaluating || isClosed}
            className="px-3 py-1.5 bg-cyan-900/40 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-200 rounded-lg text-[11px] font-mono flex items-center gap-1.5 transition disabled:opacity-50"
            title="Evaluate SLA status against real PostgreSQL time"
          >
            <Zap className={`w-3 h-3 text-cyan-400 ${evaluating ? 'animate-spin' : ''}`} />
            Evaluate Against DB
          </button>
        </div>
      </div>

      {/* Append-only Event History */}
      <div className="space-y-2 pt-1 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
            <History className="w-3.5 h-3.5 text-slate-500" />
            SLA Escalation Audit Log ({events.length})
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            Append-only PostgreSQL Log
          </span>
        </div>

        {events.length === 0 ? (
          <div className="p-2.5 bg-slate-900/40 rounded border border-slate-800 text-[11px] text-slate-400 font-mono">
            No SLA escalation events recorded yet.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {events.map((ev, idx) => {
              const isWarning = ev.event_type === 'SLA_WARNING' || ev.new_sla_status === 'AT_RISK';
              const isBreach = ev.event_type === 'SLA_BREACHED' || ev.new_sla_status === 'SLA_BREACHED';

              let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';
              if (isBreach) badgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
              else if (isWarning) badgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
              else if (ev.event_type === 'SLA_INITIALIZED') badgeStyle = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';

              return (
                <div
                  key={ev.id || idx}
                  className="p-2 bg-slate-900/50 rounded border border-slate-800/80 flex items-start justify-between gap-2 text-[11px] font-mono"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] border font-bold ${badgeStyle}`}>
                        {ev.event_type}
                      </span>
                      <span className="text-slate-300 text-[10px]">
                        {ev.previous_sla_status ? `${ev.previous_sla_status} → ` : ''}{ev.new_sla_status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      {ev.reason}
                    </p>
                  </div>
                  <span className="text-[9px] text-slate-400 shrink-0">
                    {formatDate(ev.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
