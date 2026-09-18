import React, { useState, useEffect } from 'react';
import {
  ListFilter,
  RefreshCw,
  Clock,
  MapPin,
  Camera,
  Radio,
  FileCheck,
  Sparkles,
  Layers,
  Send,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Info
} from 'lucide-react';
import { fetchRecentComplaints, routeComplaint, getComplaintRouting } from '../services/api';
import socket from '../services/socket';
import RoutingDecisionModal from './RoutingDecisionModal';
import CaseTrackerModal from './CaseTrackerModal';

export default function ComplaintFeed({ newComplaint }) {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [newestId, setNewestId] = useState(null);
  const [routingInProgress, setRoutingInProgress] = useState({});
  const [selectedDecision, setSelectedDecision] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [loadingDecision, setLoadingDecision] = useState(false);
  const [trackingComplaintId, setTrackingComplaintId] = useState(null);

  const loadComplaints = async () => {
    setLoading(true);
    const res = await fetchRecentComplaints(15, 0, filterCategory || null);
    if (res.success && res.data) {
      setComplaints(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadComplaints();
  }, [filterCategory]);

  // Prepend if external newComplaint submitted from form
  useEffect(() => {
    if (newComplaint && newComplaint.id) {
      setComplaints((prev) => {
        if (prev.some(c => c.id === newComplaint.id)) return prev;
        return [newComplaint, ...prev];
      });
      setNewestId(newComplaint.id);
      setTimeout(() => setNewestId(null), 3000);
    }
  }, [newComplaint]);

  // Real-time Socket.IO listeners for live civic broadcasts
  useEffect(() => {
    const handleComplaintCreated = (data) => {
      setComplaints((prev) => {
        if (prev.some(c => c.complaint_code === data.complaintCode)) return prev;
        const normalized = {
          id: data.id,
          complaint_code: data.complaintCode,
          description: data.description,
          category: data.category,
          category_source: data.categorySource,
          latitude: data.latitude,
          longitude: data.longitude,
          status: data.status,
          photo_url: data.hasPhoto ? 'attached' : null,
          created_at: data.createdAt
        };
        return [normalized, ...prev];
      });
      setNewestId(data.id);
      setTimeout(() => setNewestId(null), 3000);
    };

    const handleRoutingCompleted = (data) => {
      setComplaints((prev) =>
        prev.map((c) =>
          c.id === data.complaintId || c.complaint_code === data.complaintCode
            ? { ...c, status: 'ROUTED', authority_name: data.authorityName, department_name: data.departmentName }
            : c
        )
      );
    };

    const handleRoutingReview = (data) => {
      setComplaints((prev) =>
        prev.map((c) =>
          c.id === data.complaintId || c.complaint_code === data.complaintCode
            ? { ...c, status: 'HUMAN_REVIEW' }
            : c
        )
      );
    };

    const handleStatusChanged = (data) => {
      setComplaints((prev) =>
        prev.map((c) =>
          c.id === data.complaintId || c.complaint_code === data.complaintCode
            ? { ...c, status: data.newStatus }
            : c
        )
      );
    };

    socket.on('complaint:created', handleComplaintCreated);
    socket.on('routing:completed', handleRoutingCompleted);
    socket.on('routing:review_required', handleRoutingReview);
    socket.on('complaint:status_changed', handleStatusChanged);

    return () => {
      socket.off('complaint:created', handleComplaintCreated);
      socket.off('routing:completed', handleRoutingCompleted);
      socket.off('routing:review_required', handleRoutingReview);
      socket.off('complaint:status_changed', handleStatusChanged);
    };
  }, []);

  const handleRouteClick = async (complaint) => {
    setRoutingInProgress(prev => ({ ...prev, [complaint.id]: true }));
    const res = await routeComplaint(complaint.id);
    setRoutingInProgress(prev => ({ ...prev, [complaint.id]: false }));

    if (res.success && res.data) {
      setComplaints(prev =>
        prev.map(c => c.id === complaint.id ? { ...c, status: res.data.routing_status } : c)
      );
      setSelectedComplaint(complaint);
      setSelectedDecision(res.data);
    } else {
      alert(`Routing error: ${res.error}`);
    }
  };

  const handleViewDecision = async (complaint) => {
    setSelectedComplaint(complaint);
    setLoadingDecision(true);
    const res = await getComplaintRouting(complaint.id);
    setLoadingDecision(false);
    if (res.success && res.data) {
      setSelectedDecision(res.data);
    } else {
      alert(`Could not retrieve routing decision: ${res.error || 'None exists'}`);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              Live Intake & Routing Feed
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              Stage 5 Deterministic Engine Active
            </span>
          </div>
        </div>

        <button
          onClick={loadComplaints}
          disabled={loading}
          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          title="Refresh Feed"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Feed List */}
      <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
        {loading && complaints.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 font-mono">
            Loading recent complaints from database...
          </div>
        ) : complaints.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 font-mono">
            No complaints recorded yet in this category.
          </div>
        ) : (
          complaints.map((item) => {
            const isNew = item.id === newestId;
            const isRouted = item.status === 'ROUTED';
            const isReview = item.status === 'HUMAN_REVIEW';
            const isReceived = item.status === 'RECEIVED';
            const isBusy = !!routingInProgress[item.id];

            return (
              <div
                key={item.id || item.complaint_code}
                className={`p-3 rounded-lg border transition-all ${
                  isNew
                    ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-950/30'
                    : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <FileCheck className="w-3.5 h-3.5 text-slate-400" />
                    {item.complaint_code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                      {item.category}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                      isRouted
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-500/30'
                        : isReview
                        ? 'bg-amber-950 text-amber-400 border-amber-500/30'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-200 line-clamp-2 mb-2 leading-relaxed">
                  {item.description}
                </p>

                {/* Stage 5 Deterministic Routing Actions */}
                <div className="flex items-center justify-between gap-2 my-2 pt-2 border-t border-slate-800/40">
                  <div className="text-[10px] text-slate-400 font-mono">
                    {isRouted ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> PostGIS Routed
                      </span>
                    ) : isReview ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Review Required
                      </span>
                    ) : (
                      <span className="text-slate-500">Awaiting Spatial Route</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isReceived ? (
                      <button
                        onClick={() => handleRouteClick(item)}
                        disabled={isBusy}
                        className="px-2.5 py-1 bg-civic-600 hover:bg-civic-500 disabled:opacity-50 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition shadow-sm"
                      >
                        <Zap className={`w-3 h-3 ${isBusy ? 'animate-spin' : 'text-amber-300'}`} />
                        {isBusy ? 'Routing...' : 'Route Complaint'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleViewDecision(item)}
                        disabled={loadingDecision}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-mono flex items-center gap-1 transition border border-slate-700"
                      >
                        <Info className="w-3 h-3 text-civic-400" />
                        View Decision
                      </button>
                    )}

                    {/* Stage 6: Case Tracker */}
                    <button
                      onClick={() => setTrackingComplaintId(item.id)}
                      className="px-2 py-1 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 rounded text-[10px] font-semibold flex items-center gap-1 transition border border-emerald-500/40 shadow-sm"
                      title="Track Complaint Lifecycle & Actions"
                    >
                      <Clock className="w-3 h-3 text-emerald-400" />
                      Track Case
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 font-mono pt-1.5 border-t border-slate-800/60 gap-1">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-civic-400" />
                    {parseFloat(item.latitude).toFixed(4)}°, {parseFloat(item.longitude).toFixed(4)}°
                  </span>

                  <div className="flex items-center gap-2">
                    {item.photo_url && (
                      <span className="text-slate-400 flex items-center gap-0.5" title="Photo Evidence Attached">
                        <Camera className="w-3 h-3 text-civic-400" /> Photo
                      </span>
                    )}
                    <span className="text-slate-500 flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Routing Decision Modal */}
      {selectedDecision && (
        <RoutingDecisionModal
          decision={selectedDecision}
          complaint={selectedComplaint}
          onClose={() => {
            setSelectedDecision(null);
            setSelectedComplaint(null);
          }}
        />
      )}

      {/* Stage 6 Case Tracker Modal */}
      {trackingComplaintId && (
        <CaseTrackerModal
          complaintId={trackingComplaintId}
          onClose={() => setTrackingComplaintId(null)}
        />
      )}
    </div>
  );
}
