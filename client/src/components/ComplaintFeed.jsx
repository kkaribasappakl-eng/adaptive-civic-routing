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
  Layers
} from 'lucide-react';
import { fetchRecentComplaints } from '../services/api';
import socket from '../services/socket';

export default function ComplaintFeed({ newComplaint }) {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [newestId, setNewestId] = useState(null);

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

  // Real-time Socket.IO listener for live civic broadcasts
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

    socket.on('complaint:created', handleComplaintCreated);
    return () => {
      socket.off('complaint:created', handleComplaintCreated);
    };
  }, []);

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
              Live Intake Feed (PostgreSQL Stream)
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              Real-time Socket.IO broadcasts
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
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                      {item.status}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-200 line-clamp-2 mb-2 leading-relaxed">
                  {item.description}
                </p>

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
    </div>
  );
}
