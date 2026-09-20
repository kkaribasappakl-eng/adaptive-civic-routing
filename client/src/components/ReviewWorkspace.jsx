import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  UserCheck,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Search,
  Building2,
  Layers,
  MapPin,
  Camera,
  FileText,
  Activity,
  History,
  Lock,
  ChevronRight,
  ExternalLink,
  Filter,
  Check,
  Zap,
  Info,
  Phone
} from 'lucide-react';
import { MapContainer, Marker, Popup, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import CivicMapLayers from './CivicMapLayers';
import MapLayerToggle from './MapLayerToggle';
import {
  getReviews,
  getReviewDetail,
  startReview,
  resolveReview,
  markReviewUnroutable,
  getReviewActions,
  getReviewAuthorities,
  getJurisdictionBoundaries,
  getMediaUrl
} from '../services/api';
import socket from '../services/socket';

// Fix Leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function ReviewWorkspace({ onSelectComplaint }) {
  // Queue state
  const [reviews, setReviews] = useState([]);
  const [counts, setCounts] = useState({ all: 0, open: 0, inReview: 0, resolved: 0, rejected: 0 });
  const [selectedStatusTab, setSelectedStatusTab] = useState('OPEN');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingList, setLoadingList] = useState(false);

  // Selected case state
  const [selectedReviewId, setSelectedReviewId] = useState(null);
  const [caseData, setCaseData] = useState(null);
  const [loadingCase, setLoadingCase] = useState(false);

  // Authorities and departments from PostgreSQL
  const [authorities, setAuthorities] = useState([]);
  const [boundaries, setBoundaries] = useState(null);
  const [mapLayer, setMapLayer] = useState('standard');

  // Action form state
  const [reviewerName, setReviewerName] = useState(() => localStorage.getItem('civic_reviewer_name') || 'Officer Mysuru');
  const [operatorNote, setOperatorNote] = useState('');
  const [selectedAuthorityId, setSelectedAuthorityId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [unroutableReason, setUnroutableReason] = useState('');
  const [activeActionTab, setActiveActionTab] = useState('route'); // 'route' | 'triage' | 'unroutable' | 'close'
  const [submittingAction, setSubmittingAction] = useState(false);
  const [feedback, setFeedback] = useState({ error: '', success: '' });

  // Load authorities on mount
  useEffect(() => {
    const fetchAuthorities = async () => {
      const res = await getReviewAuthorities();
      if (res.success && res.data) {
        setAuthorities(res.data);
      }
    };
    fetchAuthorities();

    const fetchBoundaries = async () => {
      const res = await getJurisdictionBoundaries();
      if (res.success && res.data) {
        setBoundaries(res.data);
      }
    };
    fetchBoundaries();
  }, []);

  // Save reviewerName to localStorage
  useEffect(() => {
    if (reviewerName) {
      localStorage.setItem('civic_reviewer_name', reviewerName);
    }
  }, [reviewerName]);

  // Load reviews list
  const loadReviews = async (keepSelection = true) => {
    setLoadingList(true);
    const res = await getReviews({
      status: selectedStatusTab,
      search: searchQuery
    });
    if (res.success && res.data) {
      setReviews(res.data.reviews || []);
      setCounts(res.data.counts || { all: 0, open: 0, inReview: 0, resolved: 0, rejected: 0 });

      // If nothing selected or selection no longer exists, select first item
      if (!keepSelection || !selectedReviewId) {
        if (res.data.reviews?.length > 0) {
          setSelectedReviewId(res.data.reviews[0].review_id);
        } else {
          setSelectedReviewId(null);
          setCaseData(null);
        }
      }
    }
    setLoadingList(false);
  };

  useEffect(() => {
    loadReviews(false);
  }, [selectedStatusTab]);

  // Handle search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadReviews(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load detailed case when selectedReviewId changes
  const loadCaseDetail = async (id) => {
    if (!id) return;
    setLoadingCase(true);
    setFeedback({ error: '', success: '' });
    const res = await getReviewDetail(id);
    if (res.success && res.data) {
      setCaseData(res.data);
      // Pre-fill existing assignment if already selected
      if (res.data.review?.selected_authority_id) {
        setSelectedAuthorityId(res.data.review.selected_authority_id);
        setSelectedDepartmentId(res.data.review.selected_department_id || '');
      } else {
        setSelectedAuthorityId('');
        setSelectedDepartmentId('');
      }
      setOperatorNote('');
      setUnroutableReason('');
    } else {
      setFeedback({ error: res.error || 'Failed to load case dossier', success: '' });
    }
    setLoadingCase(false);
  };

  useEffect(() => {
    if (selectedReviewId) {
      loadCaseDetail(selectedReviewId);
    }
  }, [selectedReviewId]);

  // Socket.IO real-time listener for review workflow events
  useEffect(() => {
    const handleReviewCreated = (data) => {
      loadReviews(true);
    };
    const handleReviewUpdated = (data) => {
      loadReviews(true);
      if (data.reviewId === selectedReviewId) {
        loadCaseDetail(selectedReviewId);
      }
    };
    const handleReviewResolved = (data) => {
      loadReviews(true);
      if (data.reviewId === selectedReviewId) {
        loadCaseDetail(selectedReviewId);
      }
    };
    const handleReviewUnroutable = (data) => {
      loadReviews(true);
      if (data.reviewId === selectedReviewId) {
        loadCaseDetail(selectedReviewId);
      }
    };

    socket.on('review:created', handleReviewCreated);
    socket.on('review:updated', handleReviewUpdated);
    socket.on('review:resolved', handleReviewResolved);
    socket.on('review:unroutable', handleReviewUnroutable);

    return () => {
      socket.off('review:created', handleReviewCreated);
      socket.off('review:updated', handleReviewUpdated);
      socket.off('review:resolved', handleReviewResolved);
      socket.off('review:unroutable', handleReviewUnroutable);
    };
  }, [selectedReviewId]);

  // Filter available departments based on selected authority
  const availableDepartments = useMemo(() => {
    if (!selectedAuthorityId) return [];
    const auth = authorities.find(a => a.id === selectedAuthorityId);
    return auth?.departments || [];
  }, [selectedAuthorityId, authorities]);

  // Handler: Start Review
  const handleStartReview = async () => {
    if (!reviewerName.trim()) {
      setFeedback({ error: 'Reviewer name is required to begin review.', success: '' });
      return;
    }
    setSubmittingAction(true);
    setFeedback({ error: '', success: '' });

    const res = await startReview(selectedReviewId, reviewerName, operatorNote);
    if (res.success) {
      setFeedback({ error: '', success: 'Review investigation started.' });
      await loadCaseDetail(selectedReviewId);
      await loadReviews(true);
    } else {
      setFeedback({ error: res.error || 'Failed to start review', success: '' });
    }
    setSubmittingAction(false);
  };

  // Handler: Route to Authority
  const handleRouteToAuthority = async () => {
    if (!reviewerName.trim()) {
      setFeedback({ error: 'Reviewer name is required.', success: '' });
      return;
    }
    if (!selectedAuthorityId) {
      setFeedback({ error: 'Please select a real Authority from PostgreSQL.', success: '' });
      return;
    }
    if (!selectedDepartmentId) {
      setFeedback({ error: 'Please select a real Department under the chosen authority.', success: '' });
      return;
    }
    if (!operatorNote.trim()) {
      setFeedback({ error: 'Please provide an operator note or justification for this manual route.', success: '' });
      return;
    }

    setSubmittingAction(true);
    setFeedback({ error: '', success: '' });

    const res = await resolveReview(selectedReviewId, {
      actionType: 'ROUTE_TO_AUTHORITY',
      authorityId: selectedAuthorityId,
      departmentId: selectedDepartmentId,
      reviewerName,
      note: operatorNote
    });

    if (res.success) {
      setFeedback({ error: '', success: 'Case successfully routed to authority via Human Review!' });
      await loadCaseDetail(selectedReviewId);
      await loadReviews(true);
    } else {
      setFeedback({ error: res.error || 'Failed to route case', success: '' });
    }
    setSubmittingAction(false);
  };

  // Handler: Return to Triage
  const handleReturnToTriage = async () => {
    if (!reviewerName.trim()) {
      setFeedback({ error: 'Reviewer name is required.', success: '' });
      return;
    }
    setSubmittingAction(true);
    setFeedback({ error: '', success: '' });

    const res = await resolveReview(selectedReviewId, {
      actionType: 'RETURN_TO_TRIAGE',
      reviewerName,
      note: operatorNote || 'Returned to triage queue'
    });

    if (res.success) {
      setFeedback({ error: '', success: 'Case returned to triage queue.' });
      await loadCaseDetail(selectedReviewId);
      await loadReviews(true);
    } else {
      setFeedback({ error: res.error || 'Failed to return to triage', success: '' });
    }
    setSubmittingAction(false);
  };

  // Handler: Mark Unroutable
  const handleMarkUnroutable = async () => {
    if (!reviewerName.trim()) {
      setFeedback({ error: 'Reviewer name is required.', success: '' });
      return;
    }
    if (!unroutableReason.trim()) {
      setFeedback({ error: 'A detailed reason explaining why this complaint is unroutable is mandatory.', success: '' });
      return;
    }

    setSubmittingAction(true);
    setFeedback({ error: '', success: '' });

    const res = await markReviewUnroutable(selectedReviewId, reviewerName, unroutableReason);
    if (res.success) {
      setFeedback({ error: '', success: 'Complaint marked as UNROUTABLE. Audit record appended.' });
      await loadCaseDetail(selectedReviewId);
      await loadReviews(true);
    } else {
      setFeedback({ error: res.error || 'Failed to mark unroutable', success: '' });
    }
    setSubmittingAction(false);
  };

  // Status badge styling helper
  const getReviewStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return 'bg-amber-950/60 border-amber-500/40 text-amber-300';
      case 'IN_REVIEW':
        return 'bg-blue-950/60 border-blue-500/40 text-blue-300 animate-pulse';
      case 'RESOLVED':
        return 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300';
      case 'REJECTED':
        return 'bg-rose-950/60 border-rose-500/40 text-rose-300';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  const getSlaBadge = (status) => {
    switch (status) {
      case 'ON_TRACK':
        return 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300';
      case 'WARNING':
        return 'bg-amber-950/50 border-amber-500/40 text-amber-300';
      case 'BREACHED':
        return 'bg-rose-950/50 border-rose-500/40 text-rose-300';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              STAGE 9 ACTIVE
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Deterministic Human-in-the-Loop Architecture
            </span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            Operator Review & Exception Workspace
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
            Human operators resolve civic complaints that fell out of deterministic PostGIS containment or automated category mappings. Every decision preserves original automated provenance and appends immutable audit records.
          </p>
        </div>

        {/* Global Reviewer Identity Badge */}
        <div className="flex items-center gap-3 bg-[#070b16]/90 border border-slate-800/90 px-4 py-2.5 rounded-xl shadow-inner">
          <UserCheck className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <label className="block text-[10px] uppercase font-mono tracking-wider text-slate-400">
              Active Operator
            </label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none focus:border-b border-amber-400 w-36"
              placeholder="Operator Name"
            />
          </div>
        </div>
      </div>

      {/* Main Workspace Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ========================================================= */}
        {/* LEFT COLUMN: REVIEW QUEUE (4 COLS)                       */}
        {/* ========================================================= */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-4 shadow-xl space-y-4 backdrop-blur">
            {/* Filter Tabs with real counts */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-amber-400" />
                Review Queue
              </span>
              <button
                onClick={() => loadReviews(true)}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono transition"
                title="Refresh queue"
              >
                <RotateCcw className={`w-3 h-3 ${loadingList ? 'animate-spin text-amber-400' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Status Pills */}
            <div className="grid grid-cols-5 gap-1 bg-[#070b16] p-1 rounded-xl border border-slate-800 text-[11px] font-mono">
              <button
                onClick={() => setSelectedStatusTab('OPEN')}
                className={`py-1.5 px-1 rounded-lg text-center font-semibold transition ${
                  selectedStatusTab === 'OPEN'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                OPEN <span className="text-[10px] opacity-80">({counts.open})</span>
              </button>
              <button
                onClick={() => setSelectedStatusTab('IN_REVIEW')}
                className={`py-1.5 px-1 rounded-lg text-center font-semibold transition ${
                  selectedStatusTab === 'IN_REVIEW'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                IN REV <span className="text-[10px] opacity-80">({counts.inReview})</span>
              </button>
              <button
                onClick={() => setSelectedStatusTab('RESOLVED')}
                className={`py-1.5 px-1 rounded-lg text-center font-semibold transition ${
                  selectedStatusTab === 'RESOLVED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                RES <span className="text-[10px] opacity-80">({counts.resolved})</span>
              </button>
              <button
                onClick={() => setSelectedStatusTab('REJECTED')}
                className={`py-1.5 px-1 rounded-lg text-center font-semibold transition ${
                  selectedStatusTab === 'REJECTED'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                UNROUT <span className="text-[10px] opacity-80">({counts.rejected})</span>
              </button>
              <button
                onClick={() => setSelectedStatusTab('ALL')}
                className={`py-1.5 px-1 rounded-lg text-center font-semibold transition ${
                  selectedStatusTab === 'ALL'
                    ? 'bg-slate-700/50 text-white border border-slate-600 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ALL <span className="text-[10px] opacity-80">({counts.all})</span>
              </button>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search code or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Queue List */}
            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {loadingList ? (
                <div className="py-12 text-center text-xs text-slate-500 font-mono">
                  Loading review cases...
                </div>
              ) : reviews.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl p-4">
                  No review cases found in '{selectedStatusTab}' queue.
                </div>
              ) : (
                reviews.map((r) => {
                  const isSelected = r.review_id === selectedReviewId;
                  return (
                    <div
                      key={r.review_id}
                      onClick={() => setSelectedReviewId(r.review_id)}
                      className={`p-3 rounded-xl border transition cursor-pointer text-left ${
                        isSelected
                          ? 'bg-amber-950/20 border-amber-500/50 shadow-md ring-1 ring-amber-500/20'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                          {r.complaint_code}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${getReviewStatusBadge(r.review_status)}`}>
                          {r.review_status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 line-clamp-2 mb-2">
                        {r.description}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                          {r.category}
                        </span>
                        <span>{new Date(r.review_created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: CASE DOSSIER & OPERATOR ACTION DESK (8 COLS)*/}
        {/* ========================================================= */}
        <div className="lg:col-span-8 space-y-5">
          {!selectedReviewId || !caseData ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center text-slate-500 shadow-xl">
              <ShieldAlert className="w-12 h-12 mx-auto text-slate-700 mb-3" />
              <h3 className="text-sm font-semibold text-slate-300">No Review Case Selected</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Select a complaint from the review queue on the left to inspect evidence, PostGIS spatial provenance, and take human routing action.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Feedback messages */}
              {feedback.error && (
                <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{feedback.error}</span>
                </div>
              )}
              {feedback.success && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{feedback.success}</span>
                </div>
              )}

              {/* Case Dossier Header Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-white">
                        {caseData.complaint.complaint_code}
                      </span>
                      <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${getReviewStatusBadge(caseData.review.status)}`}>
                        {caseData.review.status}
                      </span>
                      <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-800">
                        {caseData.complaint.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1">
                      Case ID: {caseData.review.id} • Created: {new Date(caseData.review.created_at).toLocaleString()}
                    </p>
                  </div>

                  {/* SLA Quick Status */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">SLA:</span>
                    <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${getSlaBadge(caseData.sla.status)}`}>
                      {caseData.sla.status || 'UNCONFIGURED'}
                    </span>
                  </div>
                </div>

                {/* Grid of Evidence & Provenance */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left sub-column: Details */}
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[11px] font-mono uppercase text-slate-400 block mb-1">Issue Description</span>
                      <p className="text-slate-200 bg-slate-950/70 p-3 rounded-xl border border-slate-800 leading-relaxed">
                        {caseData.complaint.description}
                      </p>
                    </div>

                    {/* Authorized Reporter Contact */}
                    {caseData.complaint.citizen_contact && (
                      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Reporter Contact</span>
                            <span className="font-bold text-teal-300">{caseData.complaint.citizen_contact}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          Verified Citizen Mobile
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] font-mono text-slate-400 block">Category</span>
                        <span className="font-semibold text-white">{caseData.complaint.category}</span>
                      </div>
                      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] font-mono text-slate-400 block">Category Source</span>
                        <span className="font-semibold text-amber-300">{caseData.complaint.category_source}</span>
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] font-mono text-slate-400 block">Original Review Reason</span>
                      <p className="text-amber-200/90 text-xs mt-0.5">{caseData.review.reason}</p>
                    </div>

                    {/* Routing State Provenance */}
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1 font-mono text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Routing Status:</span>
                        <span className="text-white font-bold">{caseData.routing.routing_status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Routing Method:</span>
                        <span className={caseData.routing.routing_method === 'HUMAN_REVIEW' ? 'text-amber-300' : 'text-cyan-300'}>
                          {caseData.routing.routing_method}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Assigned Authority:</span>
                        <span className="text-emerald-300 font-semibold">{caseData.routing.authority?.name || 'Unassigned'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Assigned Department:</span>
                        <span className="text-emerald-300">{caseData.routing.department?.name || 'Unassigned'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Active Version:</span>
                        <span className="text-slate-300">{caseData.routing.version_code || 'MYS_2026_V1'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right sub-column: Map & Photo Evidence */}
                  <div className="space-y-3">
                    {/* Location & Leaflet Map (Medium Size 500px) */}
                    <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-2 overflow-hidden">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1 mb-1.5">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-amber-400" />
                          Location ({caseData.complaint.latitude.toFixed(4)}°, {caseData.complaint.longitude.toFixed(4)}°)
                        </span>
                        {/* Standard / Satellite Layer Switcher with transparent labels */}
                        <MapLayerToggle mapLayer={mapLayer} onToggle={setMapLayer} />
                      </div>
                      <div className="h-[500px] w-full rounded-lg overflow-hidden border border-slate-800 z-0">
                        <MapContainer
                          center={[caseData.complaint.latitude, caseData.complaint.longitude]}
                          zoom={14}
                          scrollWheelZoom={false}
                          style={{ height: '100%', width: '100%' }}
                        >
                          <CivicMapLayers mapLayer={mapLayer} />
                          {boundaries && (
                            <GeoJSON
                              data={boundaries}
                              style={{
                                color: '#10b981',
                                weight: 2,
                                fillOpacity: 0.1
                              }}
                            />
                          )}
                          <Marker 
                            key={`review-marker-${caseData.complaint.latitude}-${caseData.complaint.longitude}`}
                            position={[caseData.complaint.latitude, caseData.complaint.longitude]}
                          >
                            <Popup>
                              <div className="text-xs font-mono font-bold">
                                {caseData.complaint.complaint_code}
                              </div>
                            </Popup>
                          </Marker>
                        </MapContainer>
                      </div>
                    </div>

                    {/* Photo Evidence */}
                    <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] font-mono text-slate-400 block mb-1 flex items-center gap-1">
                        <Camera className="w-3 h-3 text-slate-400" /> Photo Evidence
                      </span>
                      {caseData.complaint.photo_url ? (
                        <img
                          src={getMediaUrl(caseData.complaint.photo_url)}
                          alt="Evidence"
                          className="h-28 w-full object-cover rounded-lg border border-slate-800"
                        />
                      ) : (
                        <div className="h-16 flex items-center justify-center text-slate-600 text-xs font-mono border border-dashed border-slate-800 rounded-lg">
                          No photographic evidence attached
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* =================================================== */}
              {/* OPERATOR ACTION DESK                                */}
              {/* =================================================== */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-amber-400" />
                    Operator Action Desk
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    Active State: <strong className="text-white">{caseData.review.status}</strong>
                  </span>
                </div>

                {/* If Case is Closed/Resolved */}
                {['RESOLVED', 'REJECTED'].includes(caseData.review.status) ? (
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl text-center space-y-2">
                    <Lock className="w-6 h-6 mx-auto text-slate-500" />
                    <h4 className="text-xs font-bold text-slate-300">
                      Case {caseData.review.status === 'RESOLVED' ? 'Resolved' : 'Marked Unroutable'} & Terminated
                    </h4>
                    <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                      This review case is closed. Resolved by <strong>{caseData.review.reviewer_name || 'Operator'}</strong> on{' '}
                      {caseData.review.resolved_at ? new Date(caseData.review.resolved_at).toLocaleString() : 'N/A'}.
                      Actions are append-only and cannot be overridden.
                    </p>
                  </div>
                ) : (
                  /* Active Action Panel */
                  <div className="space-y-4">
                    {/* Action Step 1: Start Review if OPEN */}
                    {caseData.review.status === 'OPEN' && (
                      <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-xs font-bold text-amber-300">Investigation Not Yet Started</h4>
                          <p className="text-[11px] text-slate-300">
                            Claim this case to mark it <span className="font-mono text-blue-400 font-semibold">IN_REVIEW</span> and record your assignment.
                          </p>
                        </div>
                        <button
                          onClick={handleStartReview}
                          disabled={submittingAction}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-lg transition shrink-0 flex items-center gap-1.5 shadow"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Start Review
                        </button>
                      </div>
                    )}

                    {/* Action Selector Tabs */}
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
                      <button
                        onClick={() => setActiveActionTab('route')}
                        className={`flex-1 py-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 ${
                          activeActionTab === 'route'
                            ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        Route to Authority
                      </button>
                      <button
                        onClick={() => setActiveActionTab('triage')}
                        className={`flex-1 py-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 ${
                          activeActionTab === 'triage'
                            ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Return to Triage
                      </button>
                      <button
                        onClick={() => setActiveActionTab('unroutable')}
                        className={`flex-1 py-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 ${
                          activeActionTab === 'unroutable'
                            ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Mark Unroutable
                      </button>
                    </div>

                    {/* Form Body based on chosen action tab */}
                    {activeActionTab === 'route' && (
                      <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Real Authority Dropdown from PostgreSQL */}
                          <div>
                            <label className="block text-[11px] font-mono text-slate-300 mb-1">
                              Civic Authority <span className="text-rose-400">*</span>
                            </label>
                            <select
                              value={selectedAuthorityId}
                              onChange={(e) => {
                                setSelectedAuthorityId(e.target.value);
                                setSelectedDepartmentId('');
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
                            >
                              <option value="">Select Civic Authority...</option>
                              {authorities.map(a => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.code})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Real Department Dropdown from PostgreSQL */}
                          <div>
                            <label className="block text-[11px] font-mono text-slate-300 mb-1">
                              Department <span className="text-rose-400">*</span>
                            </label>
                            <select
                              value={selectedDepartmentId}
                              onChange={(e) => setSelectedDepartmentId(e.target.value)}
                              disabled={!selectedAuthorityId}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium disabled:opacity-50"
                            >
                              <option value="">Select Department...</option>
                              {availableDepartments.map(d => (
                                <option key={d.id} value={d.id}>
                                  {d.name} ({d.code})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Note / Rationale */}
                        <div>
                          <label className="block text-[11px] font-mono text-slate-300 mb-1">
                            Operator Routing Justification <span className="text-rose-400">*</span>
                          </label>
                          <textarea
                            rows={2}
                            value={operatorNote}
                            onChange={(e) => setOperatorNote(e.target.value)}
                            placeholder="State reason for manual jurisdiction/department assignment..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            onClick={handleRouteToAuthority}
                            disabled={submittingAction || !selectedAuthorityId || !selectedDepartmentId || !operatorNote.trim()}
                            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow"
                          >
                            <Check className="w-4 h-4" />
                            Confirm Route to Authority (HUMAN_REVIEW)
                          </button>
                        </div>
                      </div>
                    )}

                    {activeActionTab === 'triage' && (
                      <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                        <p className="text-xs text-slate-400">
                          Returning case to <span className="font-mono text-cyan-300">TRIAGED</span> status sends it back for AI/manual re-classification or preliminary verification.
                        </p>
                        <div>
                          <label className="block text-[11px] font-mono text-slate-300 mb-1">
                            Reason for Return to Triage
                          </label>
                          <textarea
                            rows={2}
                            value={operatorNote}
                            onChange={(e) => setOperatorNote(e.target.value)}
                            placeholder="Explain why case requires re-triaging..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            onClick={handleReturnToTriage}
                            disabled={submittingAction}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Return Case to Triage
                          </button>
                        </div>
                      </div>
                    )}

                    {activeActionTab === 'unroutable' && (
                      <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                        <div className="p-2.5 bg-rose-950/30 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <span>
                            Declaring a complaint <strong>UNROUTABLE</strong> marks the review as <strong>REJECTED</strong> and records an immutable audit log. Do NOT invent a fake authority.
                          </span>
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-slate-300 mb-1">
                            Mandatory Justification for Unroutable Status <span className="text-rose-400">*</span>
                          </label>
                          <textarea
                            rows={3}
                            value={unroutableReason}
                            onChange={(e) => setUnroutableReason(e.target.value)}
                            placeholder="Document why this coordinate or issue falls completely outside all civic mandates..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-rose-500"
                          />
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            onClick={handleMarkUnroutable}
                            disabled={submittingAction || !unroutableReason.trim()}
                            className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow"
                          >
                            <XCircle className="w-4 h-4" />
                            Mark as UNROUTABLE
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* =================================================== */}
              {/* APPEND-ONLY REVIEW AUDIT HISTORY                   */}
              {/* =================================================== */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-amber-400" />
                    Append-Only Review Action Audit Trail ({caseData.actions?.length || 0})
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500">
                    complaint_review_actions
                  </span>
                </div>

                {caseData.actions?.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    No operator actions recorded yet. Case is in initial intake state.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {caseData.actions.map((act) => (
                      <div
                        key={act.id}
                        className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between font-mono">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-amber-300">{act.action_type}</span>
                            <span className="text-[11px] text-slate-400">by {act.actor_name}</span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {new Date(act.created_at).toLocaleString()}
                          </span>
                        </div>

                        {act.note && (
                          <p className="text-slate-300 bg-slate-900/60 p-2 rounded-lg text-[11px]">
                            {act.note}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                          {act.previous_routing_status && (
                            <span>Routing: {act.previous_routing_status} → {act.new_routing_status}</span>
                          )}
                          {act.authority_name && (
                            <span className="text-emerald-300">Authority: {act.authority_name}</span>
                          )}
                          {act.department_name && (
                            <span className="text-emerald-300">Dept: {act.department_name}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
