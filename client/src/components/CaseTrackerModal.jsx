import React, { useState, useEffect } from 'react';
import {
  X,
  FileCheck,
  Building2,
  FileText,
  Compass,
  Layers,
  Camera,
  MapPin,
  Clock,
  Hammer,
  Award,
  Lock,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Send,
  Cpu,
  RefreshCw,
  Zap,
  Bell,
  CheckCheck,
  Check
} from 'lucide-react';
import StatusTimeline from './StatusTimeline';
import SlaStatusCard from './SlaStatusCard';
import {
  getComplaintLifecycle,
  updateComplaintStatus,
  getComplaintNotifications,
  markNotificationRead,
  markAllComplaintNotificationsRead
} from '../services/api';
import socket from '../services/socket';

export default function CaseTrackerModal({ complaintId, onClose }) {
  const [data, setData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadCase = async () => {
    setLoading(true);
    setErrorMessage('');
    const [lifecycleRes, notifsRes] = await Promise.all([
      getComplaintLifecycle(complaintId),
      getComplaintNotifications(complaintId)
    ]);

    if (lifecycleRes.success && lifecycleRes.data) {
      setData(lifecycleRes.data);
    } else {
      setErrorMessage(lifecycleRes.error || 'Failed to load case lifecycle');
    }

    if (notifsRes.success && notifsRes.data) {
      setNotifications(notifsRes.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (complaintId) {
      loadCase();
    }
  }, [complaintId]);

  // Real-time Socket.IO listener for live status updates
  useEffect(() => {
    const handleStatusChanged = (payload) => {
      if (payload.complaintId === complaintId) {
        setData((prev) => {
          if (!prev) return prev;
          const newHistory = [
            ...(prev.status_history || []),
            {
              id: 'rt-' + Date.now(),
              complaint_id: payload.complaintId,
              previous_status: payload.previousStatus,
              new_status: payload.newStatus,
              changed_by: payload.changedBy,
              reason: payload.reason,
              created_at: payload.changedAt
            }
          ];
          return {
            ...prev,
            status: payload.newStatus,
            status_history: newHistory
          };
        });
        setSuccessMessage(`Live update: Case transitioned to ${payload.newStatus}`);
        setTimeout(() => setSuccessMessage(''), 4000);
      }
    };

    const handleSlaWarning = (payload) => {
      if (payload.complaintId === complaintId) {
        setSuccessMessage(`⚠️ SLA Warning: Case resolution is AT RISK (${payload.category})`);
        setTimeout(() => setSuccessMessage(''), 5000);
      }
    };

    const handleSlaBreached = (payload) => {
      if (payload.complaintId === complaintId) {
        setErrorMessage(`🚨 SLA BREACHED: Case resolution deadline has passed (${payload.category})`);
        setTimeout(() => setErrorMessage(''), 6000);
      }
    };

    const handleNotificationCreated = (payload) => {
      if (payload.complaintId === complaintId) {
        setNotifications((prev) => {
          if (prev.some((n) => n.id === payload.notificationId)) return prev;
          const newN = {
            id: payload.notificationId,
            complaint_id: payload.complaintId,
            complaint_code: payload.complaintCode,
            notification_type: payload.notificationType,
            title: payload.title,
            message: payload.message,
            is_read: false,
            created_at: payload.createdAt
          };
          return [newN, ...prev];
        });
        setSuccessMessage(`🔔 New Notification: ${payload.title}`);
        setTimeout(() => setSuccessMessage(''), 4000);
      }
    };

    socket.on('complaint:status_changed', handleStatusChanged);
    socket.on('sla:warning', handleSlaWarning);
    socket.on('sla:breached', handleSlaBreached);
    socket.on('notification:created', handleNotificationCreated);
    return () => {
      socket.off('complaint:status_changed', handleStatusChanged);
      socket.off('sla:warning', handleSlaWarning);
      socket.off('sla:breached', handleSlaBreached);
      socket.off('notification:created', handleNotificationCreated);
    };
  }, [complaintId]);

  const handleMarkOneRead = async (notificationId) => {
    const res = await markNotificationRead(notificationId);
    if (res.success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
    }
  };

  const handleMarkAllComplaintRead = async () => {
    setNotificationsLoading(true);
    const res = await markAllComplaintNotificationsRead(complaintId);
    if (res.success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
    setNotificationsLoading(false);
  };

  const handleStatusTransition = async (targetStatus, defaultReason) => {
    setActionInProgress(true);
    setErrorMessage('');
    setSuccessMessage('');

    const reason = actionReason.trim() || defaultReason;
    const res = await updateComplaintStatus(complaintId, targetStatus, reason, 'civic_operator_ui');

    setActionInProgress(false);

    if (res.success && res.data) {
      setData((prev) => ({
        ...prev,
        status: res.data.newStatus,
        status_history: [...(prev.status_history || []), res.data.historyRecord]
      }));
      setActionReason('');
      setSuccessMessage(`Successfully updated case status to ${targetStatus}`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } else {
      setErrorMessage(res.error || 'Status transition failed.');
    }
  };

  if (!complaintId) return null;

  const status = data?.status || 'SUBMITTED';
  const routing = data?.routing;
  const isClosed = status === 'CLOSED';
  const isRouted = status === 'ROUTED';
  const isInProgress = status === 'IN_PROGRESS';
  const isResolved = status === 'RESOLVED';
  const isHumanReview = status === 'HUMAN_REVIEW';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Case Follow-Through Tracker
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border ${
                  isClosed
                    ? 'bg-slate-800 text-slate-300 border-slate-700'
                    : isResolved
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                    : isInProgress
                    ? 'bg-blue-950 text-blue-300 border-blue-500/40'
                    : isRouted
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-500/40'
                    : isHumanReview
                    ? 'bg-amber-950 text-amber-400 border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  {status}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {data?.complaint_code || 'Loading...'} • Category: {data?.category || 'N/A'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadCase}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Refresh case"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {loading && !data ? (
            <div className="py-12 text-center text-xs text-slate-500 font-mono">
              Fetching complete complaint lifecycle from database...
            </div>
          ) : (
            <>
              {/* Alert notifications */}
              {errorMessage && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/50 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
              {successMessage && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Case Details & Routing Overview */}
              <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-200 font-medium">{data?.description}</span>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-civic-400" />
                      {parseFloat(data?.latitude || 0).toFixed(4)}°, {parseFloat(data?.longitude || 0).toFixed(4)}°
                    </span>
                    {data?.photo_url && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Photo Attached
                      </span>
                    )}
                  </div>
                </div>

                {/* Routing Resolution Summary */}
                {routing ? (
                  <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Authority</span>
                      <span className="font-semibold text-slate-200 block truncate">
                        {routing.authority_name || 'None'}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Department</span>
                      <span className="font-semibold text-slate-200 block truncate">
                        {routing.department_name || 'Human Review'}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Jurisdiction</span>
                      <span className="text-slate-300 block truncate">
                        {routing.jurisdiction_name || 'None'}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Version</span>
                      <span className="font-mono text-cyan-300 block truncate">
                        {routing.version_code || 'Active'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 bg-slate-900/40 rounded border border-slate-800 text-[11px] text-slate-400 font-mono flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Spatial routing has not yet been executed for this intake.
                  </div>
                )}
              </div>

              {/* Stage 7: SLA Tracking & Escalation Card */}
              {routing && (
                <SlaStatusCard
                  complaintId={complaintId}
                  complaintStatus={status}
                  onSlaUpdated={(evalResult) => {
                    if (evalResult && evalResult.slaStatus) {
                      setData((prev) => prev ? { ...prev, sla_status: evalResult.slaStatus } : prev);
                    }
                  }}
                />
              )}

              {/* Status Actions Bar (State Machine Controls) */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    Civic Operator Actions (Stage 6 Workflow)
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Enforces Backend State Machine</span>
                </div>

                {/* Optional transition reason */}
                {!isClosed && (
                  <input
                    type="text"
                    placeholder="Optional transition reason / notes..."
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                )}

                {/* Action buttons based on current status */}
                <div className="flex flex-wrap items-center gap-2">
                  {isRouted && (
                    <button
                      onClick={() => handleStatusTransition('IN_PROGRESS', 'Assigned to field remediation crew')}
                      disabled={actionInProgress}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Hammer className={`w-3.5 h-3.5 ${actionInProgress ? 'animate-spin' : ''}`} />
                      Start Work (IN_PROGRESS)
                    </button>
                  )}

                  {isInProgress && (
                    <button
                      onClick={() => handleStatusTransition('RESOLVED', 'Field work completed and verified on-site')}
                      disabled={actionInProgress}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Award className={`w-3.5 h-3.5 ${actionInProgress ? 'animate-spin' : ''}`} />
                      Mark Resolved (RESOLVED)
                    </button>
                  )}

                  {isResolved && (
                    <button
                      onClick={() => handleStatusTransition('CLOSED', 'Citizen satisfied with remediation. Case closed.')}
                      disabled={actionInProgress}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Lock className={`w-3.5 h-3.5 ${actionInProgress ? 'animate-spin' : ''}`} />
                      Close Case (CLOSED)
                    </button>
                  )}

                  {isHumanReview && (
                    <button
                      onClick={() => handleStatusTransition('TRIAGED', 'Human review officer confirmed categorization')}
                      disabled={actionInProgress}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Filter className={`w-3.5 h-3.5 ${actionInProgress ? 'animate-spin' : ''}`} />
                      Move to Triaged (TRIAGED)
                    </button>
                  )}

                  {isClosed && (
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      This case is officially CLOSED. Terminal lifecycle state reached.
                    </div>
                  )}

                  {status === 'SUBMITTED' && (
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
                      <Clock className="w-4 h-4 text-civic-400" />
                      Intake recorded. Trigger routing from feed to proceed to ROUTED.
                    </div>
                  )}
                </div>
              </div>

              {/* Status Timeline */}
              <StatusTimeline
                currentStatus={status}
                history={data?.status_history || []}
              />

              {/* Stage 8: Citizen Notification Log */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Citizen Notification History
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {notifications.length} total
                    </span>
                    {notifications.some(n => !n.is_read) && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {notifications.filter(n => !n.is_read).length} unread
                      </span>
                    )}
                  </div>

                  {notifications.some(n => !n.is_read) && (
                    <button
                      onClick={handleMarkAllComplaintRead}
                      disabled={notificationsLoading}
                      className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Mark all read
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-800/80 text-[11px] text-slate-500 font-mono text-center">
                    No citizen notifications recorded for this case yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-2.5 rounded-lg border text-xs space-y-1 transition ${
                          !notif.is_read
                            ? 'bg-slate-900/80 border-cyan-800/50'
                            : 'bg-slate-900/40 border-slate-800/60 opacity-85'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                              {notif.notification_type}
                            </span>
                            <span className="font-semibold text-white">
                              {notif.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                            <span>
                              {notif.created_at ? new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                            {!notif.is_read ? (
                              <button
                                onClick={() => handleMarkOneRead(notif.id)}
                                className="text-slate-400 hover:text-emerald-400 transition"
                                title="Mark read"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            ) : (
                              <span className="text-slate-600 font-mono text-[9px]">READ</span>
                            )}
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {notif.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition"
          >
            Close Tracker
          </button>
        </div>
      </div>
    </div>
  );
}
