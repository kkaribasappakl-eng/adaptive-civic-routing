import React from 'react';
import {
  CheckCircle2,
  Clock,
  Send,
  Filter,
  Compass,
  Hammer,
  Award,
  Lock,
  AlertTriangle,
  UserCheck
} from 'lucide-react';

const STAGES = [
  { key: 'SUBMITTED', label: 'Submitted', desc: 'Citizen Intake', icon: Send },
  { key: 'TRIAGED', label: 'Triaged', desc: 'Spatial & Category Analysis', icon: Filter },
  { key: 'ROUTED', label: 'Routed', desc: 'Department Resolved', icon: Compass },
  { key: 'IN_PROGRESS', label: 'In Progress', desc: 'Field Remediation', icon: Hammer },
  { key: 'RESOLVED', label: 'Resolved', desc: 'Work Completed', icon: Award },
  { key: 'CLOSED', label: 'Closed', desc: 'Case Finalized', icon: Lock }
];

export default function StatusTimeline({ currentStatus, history = [] }) {
  // Map history records by new_status for quick lookup
  const historyByStatus = {};
  history.forEach((h) => {
    historyByStatus[h.new_status] = h;
  });

  const isHumanReview = currentStatus === 'HUMAN_REVIEW';
  const currentIndex = STAGES.findIndex((s) => s.key === currentStatus);

  return (
    <div className="py-2 space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-civic-400" />
          Case Lifecycle Audit Trail
        </h4>
        <span className="text-[10px] font-mono text-slate-500">
          {history.length} Event{history.length === 1 ? '' : 's'} Recorded
        </span>
      </div>

      {isHumanReview && (
        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-300 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Case Flagged for Human Review</span>
            <p className="text-[11px] text-slate-300">
              {historyByStatus['HUMAN_REVIEW']?.reason ||
                'Complaint location is outside active boundary polygons or issue category has no automated mapping.'}
            </p>
          </div>
        </div>
      )}

      {/* Vertical Timeline Steps */}
      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
        {STAGES.map((stage, idx) => {
          const hist = historyByStatus[stage.key];
          const isPassed = Boolean(hist) || (currentIndex !== -1 && idx < currentIndex);
          const isCurrent = currentStatus === stage.key;
          const StageIcon = stage.icon;

          let badgeColor = 'bg-slate-900 border-slate-700 text-slate-500';
          let textColor = 'text-slate-500';
          let titleColor = 'text-slate-400';

          if (isCurrent) {
            badgeColor = 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20 border-emerald-400';
            textColor = 'text-emerald-400';
            titleColor = 'text-white font-bold';
          } else if (isPassed) {
            badgeColor = 'bg-emerald-950 border-emerald-500/50 text-emerald-400';
            textColor = 'text-slate-300';
            titleColor = 'text-slate-200';
          }

          return (
            <div key={stage.key} className="relative group">
              {/* Timeline marker icon */}
              <div
                className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${badgeColor}`}
              >
                {isPassed && !isCurrent ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <StageIcon className="w-3 h-3" />
                )}
              </div>

              {/* Step details */}
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${titleColor}`}>{stage.label}</span>
                    <span className="text-[10px] text-slate-500">({stage.desc})</span>
                    {isCurrent && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Current
                      </span>
                    )}
                  </div>
                  {hist?.created_at && (
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(hist.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  )}
                </div>

                {hist ? (
                  <div className="text-[11px] text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                    <p className="font-mono text-slate-200 leading-relaxed">
                      "{hist.reason || 'Status recorded in database.'}"
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800/40">
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-civic-400" />
                        Actor: <strong className="text-slate-300">{hist.changed_by || 'system'}</strong>
                      </span>
                      {hist.previous_status && (
                        <span>
                          From: <strong className="text-slate-400">{hist.previous_status}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-600 font-mono">
                    {idx > currentIndex ? 'Pending prerequisite stages' : 'No history record logged'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
