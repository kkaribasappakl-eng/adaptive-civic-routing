import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import CivicMapLayers from './CivicMapLayers';
import MapLayerToggle from './MapLayerToggle';
import {
  FileText,
  Camera,
  MapPin,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Send,
  RefreshCw,
  X,
  Copy,
  Info,
  Check,
  ShieldAlert,
  HelpCircle,
  Clock
} from 'lucide-react';
import {
  classifyComplaintIssue,
  submitCitizenComplaint,
  checkDuplicateReports
} from '../services/api';
import { useAuth } from '../context/AuthContext';

// Fix default Leaflet icon paths in Vite bundles
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Map auto-invalidator to prevent gray tiles on mount
function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Map re-centering component when coordinates change externally or via input
function MapRecenter({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (
      coords &&
      typeof coords.lat === 'number' &&
      typeof coords.lng === 'number' &&
      !isNaN(coords.lat) &&
      !isNaN(coords.lng) &&
      coords.lat >= -90 && coords.lat <= 90 &&
      coords.lng >= -180 && coords.lng <= 180
    ) {
      map.setView([coords.lat, coords.lng], map.getZoom());
    }
  }, [coords.lat, coords.lng, map]);
  return null;
}

const CONTROLLED_CATEGORIES = [
  { id: 'GARBAGE', label: 'Garbage / Uncollected Waste' },
  { id: 'ILLEGAL_DUMPING', label: 'Illegal Waste Dumping' },
  { id: 'POTHOLE', label: 'Pothole / Road Damage' },
  { id: 'DRAINAGE', label: 'Drainage / Sewage Overflow' },
  { id: 'STREETLIGHT', label: 'Streetlight Not Working' },
  { id: 'C_AND_D_WASTE', label: 'Construction Debris (C&D)' },
  { id: 'WATER_LEAK', label: 'Water Main / Pipe Leak' },
  { id: 'OTHER', label: 'Other Civic Issue' }
];

// Helper to validate Indian mobile phone numbers
const validateIndianMobile = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  const stripped = phone.trim().replace(/[\s\-\(\)\.]/g, '');
  return /^(?:\+91|91|0)?([6-9]\d{9})$/.test(stripped);
};

// Interactive map click handler
function PinLocationHandler({ onLocationChange }) {
  useMapEvents({
    click(e) {
      onLocationChange(parseFloat(e.latlng.lat.toFixed(6)), parseFloat(e.latlng.lng.toFixed(6)));
    }
  });
  return null;
}

export default function ComplaintForm({ onComplaintSubmitted, onTrackComplaint }) {
  const { user, isAuthenticated } = useAuth();

  // Form State
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [categorySource, setCategorySource] = useState('MANUAL');
  const [categoryConfidence, setCategoryConfidence] = useState(null);
  const [contact, setContact] = useState('');
  const [coords, setCoords] = useState({ lat: 12.2958, lng: 76.6394 }); // Mysuru Palace default
  const [mapLayer, setMapLayer] = useState('standard'); // 'standard' | 'satellite'
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  // Auto-sync registered phone number for authenticated citizens
  useEffect(() => {
    if (user?.phone) {
      setContact(user.phone);
    }
  }, [user?.phone]);

  // Status & AI State
  const [submitting, setSubmitting] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [duplicateNotice, setDuplicateNotice] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Submission Result State
  const [submittedData, setSubmittedData] = useState(null);

  const fileInputRef = useRef(null);

  // Handle Photo selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Selected photo exceeds 5MB size limit.');
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      setErrorMessage(null);
    }
  };

  const removePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Check for duplicate reports whenever category or coordinates change
  useEffect(() => {
    if (category && coords.lat && coords.lng) {
      const timer = setTimeout(async () => {
        const res = await checkDuplicateReports(coords.lat, coords.lng, category);
        if (res.success && res.data?.possibleDuplicate) {
          setDuplicateNotice(res.data);
        } else {
          setDuplicateNotice(null);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [category, coords.lat, coords.lng]);

  // AI Classification Trigger
  const handleAiClassify = async () => {
    if (!description || description.trim().length < 5) {
      setErrorMessage('Please enter a brief description first so AI can classify the issue.');
      return;
    }

    setClassifying(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('description', description);
    if (photoFile) {
      formData.append('photo', photoFile);
    }

    const res = await classifyComplaintIssue(formData);
    setClassifying(false);

    if (res.success && res.data) {
      setAiResult(res.data);
      if (res.data.available && res.data.category) {
        setCategory(res.data.category);
        setCategorySource('AI_SUGGESTED');
        setCategoryConfidence(res.data.confidence);
        setShowCategoryPicker(false);
      } else {
        // AI unconfigured or unavailable: open manual selector smoothly
        setShowCategoryPicker(true);
        setCategorySource('MANUAL');
      }
    } else {
      setErrorMessage(res.error || 'AI classification request failed.');
      setShowCategoryPicker(true);
    }
  };

  // Citizen confirms AI suggestion
  const handleAcceptAi = () => {
    setCategorySource('AI_SUGGESTED');
    setShowCategoryPicker(false);
  };

  // Citizen overrides AI suggestion
  const handleOverrideAi = () => {
    setShowCategoryPicker(true);
    setCategorySource('CITIZEN_SELECTED');
  };

  // Submit Complaint Form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!description || description.trim().length < 5) {
      setErrorMessage('Please enter a detailed description of at least 5 characters.');
      return;
    }

    if (!photoFile) {
      setErrorMessage('A photo is required to submit a complaint.');
      return;
    }

    if (!contact || contact.trim().length === 0) {
      setErrorMessage('Phone number is required to submit a complaint.');
      return;
    }

    if (!validateIndianMobile(contact)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number (e.g., 9845012345 or +91 98450 12345).');
      return;
    }

    if (!category) {
      setErrorMessage('Please select an issue category.');
      return;
    }

    setSubmitting(true);

    const formData = new FormData();
    formData.append('description', description.trim());
    formData.append('category', category);
    formData.append('category_source', categorySource);
    if (categoryConfidence !== null) {
      formData.append('category_confidence', categoryConfidence);
    }
    formData.append('latitude', coords.lat);
    formData.append('longitude', coords.lng);
    if (contact) {
      formData.append('citizen_contact', contact.trim());
    }
    if (photoFile) {
      formData.append('photo', photoFile);
    }

    const res = await submitCitizenComplaint(formData);
    setSubmitting(false);

    if (res.success && res.data) {
      setSubmittedData({
        complaint: res.data,
        duplicateWarning: res.duplicateWarning
      });
      if (onComplaintSubmitted) {
        onComplaintSubmitted(res.data);
      }
    } else {
      setErrorMessage(res.error || 'Failed to submit complaint. Please check form values.');
    }
  };

  // Reset to submit another report
  const handleResetForm = () => {
    setDescription('');
    setCategory('');
    setCategorySource('MANUAL');
    setCategoryConfidence(null);
    setContact(user?.phone || '');
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setAiResult(null);
    setShowCategoryPicker(false);
    setErrorMessage(null);
    setDuplicateNotice(null);
    setSubmittedData(null);
  };

  const copyCaseId = () => {
    if (submittedData?.complaint?.complaint_code) {
      navigator.clipboard.writeText(submittedData.complaint.complaint_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // If already submitted, show real confirmation card
  if (submittedData) {
    const c = submittedData.complaint;
    return (
      <div className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-6 shadow-2xl space-y-6 backdrop-blur">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border border-teal-500/40 text-teal-400 flex items-center justify-center mx-auto shadow-lg shadow-teal-950/40">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">Complaint Submitted Successfully</h3>
          <p className="text-xs text-slate-400">
            Your complaint has been permanently recorded in the PostgreSQL database.
          </p>
        </div>

        {/* Case ID banner */}
        <div className="bg-[#070b16] border border-slate-800/90 rounded-xl p-4 flex items-center justify-between shadow-inner">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block">Case Tracking ID</span>
            <span className="text-lg font-mono font-bold text-teal-300">{c.complaint_code}</span>
          </div>
          <button
            onClick={copyCaseId}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedCode ? 'Copied' : 'Copy ID'}
          </button>
        </div>

        {/* Persisted Details Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-[#070b16]/70 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-slate-400 block text-[11px]">Issue Category</span>
            <span className="font-bold text-white text-sm">{c.category}</span>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
              <span>Source:</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800/90 text-teal-300 font-semibold">{c.category_source}</span>
              {c.category_confidence && (
                <span>({(parseFloat(c.category_confidence) * 100).toFixed(0)}% conf)</span>
              )}
            </div>
          </div>

          <div className="bg-[#070b16]/70 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-slate-400 block text-[11px]">Initial Status</span>
            <span className="font-bold text-teal-300 text-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              {c.status}
            </span>
            <span className="text-[10px] text-slate-500 block mt-1">
              Recorded at {new Date(c.created_at).toLocaleTimeString()}
            </span>
          </div>

          <div className="bg-[#070b16]/70 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-slate-400 block text-[11px]">Location (PostGIS Point)</span>
            <span className="font-mono text-white text-xs">
              {parseFloat(c.latitude).toFixed(5)}° N, {parseFloat(c.longitude).toFixed(5)}° E
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">SRID 4326 (WGS 84)</span>
          </div>

          <div className="bg-[#070b16]/70 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-slate-400 block text-[11px]">Photo Evidence</span>
            {c.photo_url ? (
              <span className="text-teal-300 font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Uploaded & Attached
              </span>
            ) : (
              <span className="text-slate-500">None attached</span>
            )}
          </div>
        </div>

        {/* Stage 14 Production notice */}
        <div className="bg-[#070b16]/50 border border-slate-800/70 rounded-xl p-3.5 text-[11px] text-slate-400 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Civic Tracking Active:</strong> Complaint is permanently registered in PostgreSQL.
            You can track this case live, view its PostGIS spatial routing, SLA milestones, and real-time status updates.
          </p>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={() => onTrackComplaint && onTrackComplaint(c.id || c.complaint_code)}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-teal-950/50"
          >
            <Clock className="w-4 h-4" />
            Track Case in Real Time
          </button>

          <button
            onClick={handleResetForm}
            className="w-full py-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition flex items-center justify-center gap-2 border border-slate-700/60"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Submit Another Civic Complaint
          </button>
        </div>
      </div>
    );
  }

  // Active Complaint Form
  return (
    <form onSubmit={handleSubmit} className="bg-[#0d1424]/90 border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5 backdrop-blur">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <FileText className="w-4 h-4" />
          </div>
          Report a Civic Issue (Citizen Portal)
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Submit municipal grievances with real location, photo evidence, and AI-assisted categorization.
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 1. Problem Description */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
          <span>Problem Description *</span>
          <span className="text-[11px] font-normal text-slate-400">{description.length}/2000 chars</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the civic issue in detail (e.g., Deep crater on Irwin Road near City Bus Stand causing traffic slowdown)..."
          rows={3}
          maxLength={2000}
          className="w-full p-3.5 rounded-xl bg-[#070b16] border border-slate-800 text-slate-100 text-xs focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition resize-none placeholder:text-slate-600 font-sans"
          required
        />
      </div>

      {/* 2. Photo Evidence Upload */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-teal-400" />
            <span>Photo *</span>
          </label>
          <span className="text-[10px] text-amber-300 font-semibold bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/60 font-mono">
            Required
          </span>
        </div>
        <p className="text-[11px] text-slate-400">Upload a photo of the civic issue</p>

        {!photoPreview ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-800 hover:border-teal-500/50 rounded-xl p-5 text-center cursor-pointer bg-[#070b16]/60 hover:bg-[#070b16] transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-800/60 group-hover:bg-teal-500/10 flex items-center justify-center mx-auto mb-2 text-slate-400 group-hover:text-teal-400 transition-colors border border-slate-700/60">
              <Camera className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-200 group-hover:text-teal-200 transition-colors">Click to upload photo evidence *</p>
            <p className="text-[10px] text-slate-500 mt-1">JPEG, PNG, WebP up to 5MB (Required)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 p-2.5 bg-[#070b16] rounded-xl border border-slate-800">
            <img
              src={photoPreview}
              alt="Evidence Preview"
              className="w-16 h-16 object-cover rounded-lg border border-slate-700"
            />
            <div className="flex-1 min-w-0 text-xs">
              <p className="text-slate-200 font-medium truncate">{photoFile?.name}</p>
              <p className="text-slate-500 text-[10px] font-mono">{(photoFile?.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              type="button"
              onClick={removePhoto}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Issue Category & AI Assistance */}
      <div className="space-y-2 bg-[#090e1c] p-4 rounded-xl border border-slate-800/90 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Issue Category *
          </label>
          <button
            type="button"
            onClick={handleAiClassify}
            disabled={classifying || !description.trim()}
            className="px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
          >
            <Sparkles className={`w-3 h-3 ${classifying ? 'animate-spin' : ''}`} />
            {classifying ? 'Analyzing...' : 'Ask AI to Classify'}
          </button>
        </div>

        {/* AI Result Feedback (when available) */}
        {aiResult?.available && aiResult.category && (
          <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-300 flex items-center gap-1 text-[11px]">
                <Sparkles className="w-3.5 h-3.5" />
                AI Suggested: <strong>{aiResult.category}</strong>
              </span>
              {aiResult.confidence && (
                <span className="font-mono text-[10px] text-amber-400/90 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                  {(aiResult.confidence * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>
            {aiResult.explanation && (
              <p className="text-[11px] text-slate-300 leading-relaxed">{aiResult.explanation}</p>
            )}
            <div className="pt-2 border-t border-amber-500/20 flex gap-2">
              <button
                type="button"
                onClick={handleAcceptAi}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                  categorySource === 'AI_SUGGESTED'
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Accept Suggestion
              </button>
              <button
                type="button"
                onClick={handleOverrideAi}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                  categorySource === 'CITIZEN_SELECTED'
                    ? 'bg-amber-600 text-white shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Change Category
              </button>
            </div>
          </div>
        )}

        {/* AI Unconfigured Notice */}
        {aiResult && !aiResult.available && (
          <div className="p-2.5 rounded-xl bg-[#070b16] border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>{aiResult.reason || 'AI is not configured. Please choose category manually below.'}</span>
          </div>
        )}

        {/* Category Selector Dropdown */}
        {(showCategoryPicker || !category) && (
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCategorySource(aiResult?.available ? 'CITIZEN_SELECTED' : 'MANUAL');
            }}
            className="w-full p-2.5 rounded-xl bg-[#070b16] border border-slate-700/80 text-slate-200 text-xs focus:border-teal-500 focus:outline-none"
            required
          >
            <option value="">-- Choose Controlled Issue Category --</option>
            {CONTROLLED_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label} ({cat.id})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 4. Interactive Location Selector (Map + Coordinates) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-teal-400" />
            Location Pinpoint (Leaflet) *
          </label>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 bg-[#070b16] px-2.5 py-1 rounded-lg border border-slate-800">
              <span>Lat: {coords.lat}</span>
              <span className="text-slate-600">|</span>
              <span>Lng: {coords.lng}</span>
            </div>
            {/* Standard / Satellite Layer Switcher with transparent roads & place labels */}
            <MapLayerToggle mapLayer={mapLayer} onToggle={setMapLayer} />
          </div>
        </div>

        {/* Leaflet Map for Citizen Location Pin (Medium-Large 500px) */}
        <div className="h-[500px] w-full rounded-2xl overflow-hidden border border-slate-800/90 relative z-0 shadow-inner">
          <MapContainer
            center={[coords.lat, coords.lng]}
            zoom={13}
            scrollWheelZoom={false}
            className="w-full h-full"
            style={{ height: '500px', width: '100%' }}
          >
            {/* CivicMapLayers renders OpenStreetMap tiles (https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png) with OpenStreetMap contributors attribution */}
            <CivicMapLayers mapLayer={mapLayer} />
            <MapInvalidator />
            <MapRecenter coords={coords} />
            <PinLocationHandler
              onLocationChange={(lat, lng) => setCoords({ lat, lng })}
            />
            <Marker
              key={`pin-${coords.lat}-${coords.lng}`}
              position={[coords.lat, coords.lng]}
              draggable={true}
              eventHandlers={{
                dragend(e) {
                  const marker = e.target;
                  const position = marker.getLatLng();
                  setCoords({
                    lat: parseFloat(position.lat.toFixed(6)),
                    lng: parseFloat(position.lng.toFixed(6))
                  });
                }
              }}
            />
          </MapContainer>
        </div>

        {/* Coordinate Inputs for manual precision */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block mb-0.5">Latitude (-90 to 90)</span>
            <input
              type="number"
              step="0.000001"
              value={coords.lat}
              onChange={(e) => setCoords(prev => ({ ...prev, lat: parseFloat(e.target.value) || 0 }))}
              className="w-full p-2 rounded-lg bg-[#070b16] border border-slate-800 text-slate-200 font-mono text-xs focus:border-teal-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block mb-0.5">Longitude (-180 to 180)</span>
            <input
              type="number"
              step="0.000001"
              value={coords.lng}
              onChange={(e) => setCoords(prev => ({ ...prev, lng: parseFloat(e.target.value) || 0 }))}
              className="w-full p-2 rounded-lg bg-[#070b16] border border-slate-800 text-slate-200 font-mono text-xs focus:border-teal-500 focus:outline-none"
              required
            />
          </div>
        </div>
      </div>

      {/* 5. Duplicate Warning Banner (Non-blocking) */}
      {duplicateNotice?.possibleDuplicate && (
        <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-300 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-400">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Possible Duplicate Civic Report Detected</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-200/80">
            {duplicateNotice.message} You may still submit this report if it is a recurring or separate incident.
          </p>
        </div>
      )}

      {/* 6. Citizen Phone Number */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200">
            Contact Number
          </label>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border font-mono ${
            isAuthenticated && user?.phone
              ? 'text-teal-300 bg-teal-950/60 border-teal-800/60'
              : 'text-amber-300 bg-amber-950/60 border-amber-800/60'
          }`}>
            {isAuthenticated && user?.phone ? 'Registered mobile number' : 'Required'}
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          {isAuthenticated && user?.phone
            ? 'Linked to your authenticated citizen account'
            : 'Required for complaint verification and follow-up'}
        </p>
        {isAuthenticated && user?.phone ? (
          <div className="w-full p-3 rounded-xl bg-[#070b16] border border-teal-800/60 text-slate-100 text-xs font-mono flex items-center justify-between">
            <span className="font-bold text-teal-300 text-sm tracking-wider">{user.phone}</span>
            <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              Registered mobile number
            </span>
          </div>
        ) : (
          <input
            type="tel"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="e.g., 9845012345 or +91 98450 12345"
            className="w-full p-3 rounded-xl bg-[#070b16] border border-slate-800 text-slate-100 text-xs focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none font-mono placeholder:text-slate-600 transition"
            required
          />
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send className={`w-3.5 h-3.5 ${submitting ? 'animate-spin' : ''}`} />
        {submitting ? 'Persisting to PostGIS...' : 'Submit Citizen Complaint'}
      </button>
    </form>
  );
}

