import React, { useState, useEffect } from 'react';
import {
  Layers,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  History,
  ArrowRight,
  Sparkles,
  Zap,
  RefreshCw,
  Eye,
  Shield,
  PlusCircle,
  Check,
  X,
  Compass,
  FileCode2,
  Info,
  Scale
} from 'lucide-react';
import {
  getJurisdictionVersions,
  createJurisdictionVersion,
  validateJurisdictionVersion,
  setupDemoV2,
  previewCoordinateAgainstVersion,
  activateJurisdictionVersion,
  compareVersions,
  getAuditHistory,
  testGisCoordinates
} from '../services/api';
import socket from '../services/socket';
import { useAuth } from '../context/AuthContext';

export default function VersionManager({ onVersionChange, onCoordinateSelect }) {
  const { isAdmin } = useAuth();
  const [versions, setVersions] = useState([]);
  const [activeVersion, setActiveVersion] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);

  // Modals & Panels
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showValidateModal, setShowValidateModal] = useState(false);
  const [selectedValidation, setSelectedValidation] = useState(null);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [targetVersionToActivate, setTargetVersionToActivate] = useState(null);

  // Create Draft Form State
  const [draftForm, setDraftForm] = useState({
    versionCode: '',
    notes: '',
    source: 'Civic Delimitation Working Group',
    createdBy: 'civic_operator_1'
  });

  // Safe Activation Form State
  const [activationForm, setActivationForm] = useState({
    operator: 'Civic Administrator (Demo)',
    reason: 'Routine municipal boundary delimitation transition'
  });

  // Delimitation Test Coordinate X (proven inside V1 MCC, transfers to MUDA in V2)
  const COORD_X = { lat: 12.3150, lng: 76.6500, label: 'Coordinate X (North-Central Delimitation Zone)' };

  const loadData = async () => {
    setLoading(true);
    const [verRes, auditRes] = await Promise.all([
      getJurisdictionVersions(),
      getAuditHistory()
    ]);

    if (verRes.success) {
      setVersions(verRes.data || []);
      const active = verRes.data?.find(v => v.status === 'ACTIVE');
      setActiveVersion(active || null);
      if (onVersionChange) {
        onVersionChange(active?.version_code || null);
      }
    }

    if (auditRes.success) {
      setAuditLogs(auditRes.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    // Stage 10 Real-time Socket.IO synchronization
    const handleVersionActivated = () => {
      loadData();
    };
    socket.on('jurisdiction:version_activated', handleVersionActivated);

    return () => {
      socket.off('jurisdiction:version_activated', handleVersionActivated);
    };
  }, []);

  // 1. Prepare Proposed V2 (Demo Scenario)
  const handleSetupV2 = async () => {
    setLoading(true);
    setActionMessage(null);
    const res = await setupDemoV2();
    if (res.success) {
      setActionMessage({ type: 'success', text: 'Proposed Version MYS_2026_V2 created in DRAFT status and validated.' });
      await loadData();
    } else {
      setActionMessage({ type: 'error', text: res.error || 'Failed to setup V2 proposal.' });
    }
    setLoading(false);
  };

  // 2. Create Custom Draft Version
  const handleCreateDraft = async (e) => {
    e.preventDefault();
    if (!draftForm.versionCode.trim()) {
      setActionMessage({ type: 'error', text: 'Version code is required.' });
      return;
    }

    setLoading(true);
    setActionMessage(null);
    const res = await createJurisdictionVersion(draftForm);
    if (res.success) {
      setActionMessage({
        type: 'success',
        text: `Draft version '${draftForm.versionCode.trim()}' created successfully in DRAFT status.`
      });
      setShowCreateModal(false);
      setDraftForm({
        versionCode: '',
        notes: '',
        source: 'Civic Delimitation Working Group',
        createdBy: 'civic_operator_1'
      });
      await loadData();
    } else {
      setActionMessage({ type: 'error', text: res.error || 'Failed to create draft version.' });
    }
    setLoading(false);
  };

  // 3. PostGIS Boundary Validation
  const handleRunValidation = async (version) => {
    setLoading(true);
    setActionMessage(null);
    const res = await validateJurisdictionVersion(version.id || version.version_code);
    if (res.success) {
      setSelectedValidation(res.data);
      setShowValidateModal(true);
      await loadData();
    } else {
      setActionMessage({ type: 'error', text: res.error || 'Validation execution failed.' });
    }
    setLoading(false);
  };

  // 4. Preview Coordinate X against Proposed V2 side-by-side with Active Version
  const handlePreviewCoordX = async () => {
    setLoading(true);
    setActionMessage(null);
    if (onCoordinateSelect) {
      onCoordinateSelect(COORD_X.lat, COORD_X.lng);
    }

    const [activeRes, v2PreviewRes] = await Promise.all([
      testGisCoordinates(COORD_X.lat, COORD_X.lng),
      previewCoordinateAgainstVersion('MYS_2026_V2', COORD_X.lat, COORD_X.lng)
    ]);

    setPreviewData({
      coordinate: COORD_X,
      activeResult: activeRes.data,
      proposalResult: v2PreviewRes.data
    });
    setLoading(false);
  };

  // 5. Compare V1 and V2
  const handleCompare = async () => {
    setLoading(true);
    const res = await compareVersions('MYS_2026_V1', 'MYS_2026_V2');
    if (res.success) {
      setComparisonData(res.data);
    } else {
      setActionMessage({ type: 'error', text: res.error || 'Comparison failed. Ensure both V1 and V2 exist.' });
    }
    setLoading(false);
  };

  // 6. Open Safe Activation Confirmation Modal
  const openActivationModal = (version) => {
    setTargetVersionToActivate(version);
    setShowActivateModal(true);
  };

  // 7. Execute Safe Activation
  const handleConfirmActivation = async () => {
    if (!targetVersionToActivate) return;

    setLoading(true);
    setActionMessage(null);
    const res = await activateJurisdictionVersion(targetVersionToActivate.id, {
      operator: activationForm.operator,
      reason: activationForm.reason
    });

    if (res.success) {
      setActionMessage({
        type: 'success',
        text: `Transactional Activation Success: ${res.data.activatedVersion.code} is now ACTIVE! Previous active version is RETIRED.`
      });
      setShowActivateModal(false);
      setPreviewData(null);
      await loadData();
    } else {
      setActionMessage({ type: 'error', text: res.error || 'Activation failed and rolled back.' });
    }
    setLoading(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-civic-500/10 border border-civic-500/30 text-civic-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Jurisdiction Boundary & Safe Version Management
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-civic-500/20 text-civic-300 border border-civic-500/30">
                Stage 10
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              PostgreSQL/PostGIS boundary validation • Overlap detection • Transactional activation • Single ACTIVE constraint • Immutable historical routing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 rounded-lg bg-civic-600 hover:bg-civic-500 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              Create Custom Draft
            </button>
          ) : (
            <span className="px-2.5 py-1 rounded bg-slate-800/80 text-slate-400 border border-slate-700 text-[10px] font-mono flex items-center gap-1">
              <Shield className="w-3 h-3 text-slate-400" />
              Admin Draft Creation
            </span>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh Versions"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Version Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {versions.map((ver) => {
          const isActive = ver.status === 'ACTIVE';
          const isDraft = ver.status === 'DRAFT';
          const isRetired = ver.status === 'RETIRED';
          const isValid = ver.validation_status === 'VALID';
          const isInvalid = ver.validation_status === 'INVALID';

          return (
            <div
              key={ver.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                isActive
                  ? 'bg-slate-900/90 border-emerald-500/50 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/30'
                  : isDraft
                  ? 'bg-slate-900/70 border-amber-500/40 shadow-amber-950/20'
                  : 'bg-slate-900/40 border-slate-800 opacity-80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-civic-400" />
                    {ver.version_code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {/* Lifecycle status pill */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : isDraft
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                      {ver.status}
                    </span>
                  </div>
                </div>

                {/* Validation Status Badge */}
                <div className="flex items-center justify-between mb-2 text-[11px]">
                  <span className="text-slate-400">PostGIS Validation:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center gap-1 ${
                      isValid
                        ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-300'
                        : isInvalid
                        ? 'bg-rose-950/70 border border-rose-500/40 text-rose-300'
                        : 'bg-amber-950/70 border border-amber-500/40 text-amber-300'
                    }`}
                  >
                    {isValid ? <Check className="w-3 h-3 text-emerald-400" /> : isInvalid ? <X className="w-3 h-3 text-rose-400" /> : <AlertTriangle className="w-3 h-3 text-amber-400" />}
                    {ver.validation_status || 'PENDING'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 line-clamp-2 mb-2">
                  {ver.notes || ver.source || 'Standard municipal boundary definition'}
                </p>

                {ver.validation_message && (
                  <p className="text-[10px] text-slate-400 line-clamp-1 italic mb-2">
                    {ver.validation_message}
                  </p>
                )}
              </div>

              <div className="border-t border-slate-800/80 pt-2.5 mt-2 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Boundaries: {ver.jurisdiction_count} zones</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px]">
                    DEMO / SYNTHETIC
                  </span>
                </div>

                {/* Version Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleRunValidation(ver)}
                    disabled={loading}
                    className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-medium transition flex items-center justify-center gap-1"
                  >
                    <Scale className="w-3 h-3 text-civic-400" />
                    Validate PostGIS
                  </button>

                  {isDraft && isAdmin && (
                    <button
                      onClick={() => openActivationModal(ver)}
                      disabled={loading || ver.validation_status === 'INVALID'}
                      className="py-1 px-2.5 rounded bg-emerald-600/90 hover:bg-emerald-500 text-white text-[10px] font-semibold transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Zap className="w-3 h-3" />
                      Activate
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Workflow Control Bar */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-civic-400" />
            Interactive Delimitation Workflow (Demo Simulation)
          </h3>
          {!isAdmin && (
            <span className="text-[10px] text-amber-400/90 font-mono bg-amber-950/50 px-2 py-0.5 rounded border border-amber-500/30">
              🔒 Admin Role Required for Boundary Mutation
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1. Setup V2 (Admin only) */}
          {isAdmin && (
            <button
              onClick={handleSetupV2}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <GitBranch className="w-3.5 h-3.5 text-amber-400" />
              1. Prepare Proposed V2 (DRAFT)
            </button>
          )}

          {/* 2. Preview Coordinate X (All Operators) */}
          <button
            onClick={handlePreviewCoordX}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Eye className="w-3.5 h-3.5 text-civic-400" />
            2. Preview Coordinate X Routing
          </button>

          {/* 3. Compare V1 vs V2 (All Operators) */}
          <button
            onClick={handleCompare}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            3. Compare Boundaries (Diff)
          </button>

          {/* 4. Safe Activation (Admin only) */}
          {isAdmin && (
            <button
              onClick={() => {
                const v2 = versions.find(v => v.version_code === 'MYS_2026_V2');
                if (v2) openActivationModal(v2);
              }}
              disabled={loading || activeVersion?.version_code === 'MYS_2026_V2'}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40 transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Zap className="w-3.5 h-3.5 text-white" />
              4. Atomically Activate MYS_2026_V2
            </button>
          )}
        </div>
      </div>

      {/* Side-by-side Preview Panel */}
      {previewData && (
        <div className="bg-slate-950 border border-civic-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-civic-400" />
              Pre-Activation Routing Simulation for {previewData.coordinate.label}
            </span>
            <span className="text-[11px] font-mono text-civic-400">
              {previewData.coordinate.lat}° N, {previewData.coordinate.lng}° E
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Active Routing (V1) */}
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-300">Live Active Version ({activeVersion?.version_code})</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono text-[10px]">CURRENT ACTIVE</span>
              </div>
              <p className="text-sm font-bold text-white">
                {previewData.activeResult?.authority?.name || 'Unassigned'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                Jurisdiction: {previewData.activeResult?.jurisdiction?.name} ({previewData.activeResult?.jurisdiction?.code})
              </p>
              <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                All live complaints filed right now route strictly to this authority.
              </div>
            </div>

            {/* Proposed Routing (V2) */}
            <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-amber-300">Proposed Version (MYS_2026_V2)</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 font-mono text-[10px]">PREVIEW ONLY</span>
              </div>
              <p className="text-sm font-bold text-amber-200">
                {previewData.proposalResult?.authority?.name || 'Unassigned'}
              </p>
              <p className="text-[11px] text-amber-300/80 font-mono">
                Jurisdiction: {previewData.proposalResult?.jurisdiction?.name} ({previewData.proposalResult?.jurisdiction?.code})
              </p>
              <div className="text-[10px] text-amber-400/60 pt-1 border-t border-amber-500/20">
                PostGIS preview resolves against draft geometry without impacting live traffic or existing complaints.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Modal / Panel */}
      {comparisonData && (
        <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-400" />
              Boundary Delimitation Diff ({comparisonData.fromVersion?.code} vs {comparisonData.toVersion?.code})
            </span>
            <button
              onClick={() => setComparisonData(null)}
              className="text-[11px] text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center font-mono text-xs">
                <span className="font-bold text-slate-300">{comparisonData.fromVersion?.code}</span>
                <span className="text-slate-400 text-[11px]">{comparisonData.fromVersion?.totalAreaSqKm} km²</span>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-400">
                {comparisonData.fromVersion?.jurisdictions?.map((j, idx) => (
                  <li key={idx} className="flex justify-between border-b border-slate-800/60 pb-1">
                    <span>{j.name}</span>
                    <strong className="text-slate-300">{j.authority}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center font-mono text-xs">
                <span className="font-bold text-amber-400">{comparisonData.toVersion?.code}</span>
                <span className="text-amber-300 text-[11px]">{comparisonData.toVersion?.totalAreaSqKm} km²</span>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-400">
                {comparisonData.toVersion?.jurisdictions?.map((j, idx) => (
                  <li key={idx} className="flex justify-between border-b border-slate-800/60 pb-1">
                    <span>{j.name}</span>
                    <strong className="text-amber-300">{j.authority}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Spatial Differences Summary */}
          {comparisonData.differences && (
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 flex flex-wrap gap-4 text-[11px] font-mono text-slate-300">
              <span>Added Zones: <strong className="text-emerald-400">{comparisonData.differences.addedJurisdictions?.length || 0}</strong></span>
              <span>Removed Zones: <strong className="text-rose-400">{comparisonData.differences.removedJurisdictions?.length || 0}</strong></span>
              <span>Net Area Change: <strong className="text-civic-400">{comparisonData.differences.netChangeSqKm} km²</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Real Audit History Trail */}
      <div className="border-t border-slate-800 pt-3">
        <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-2.5">
          <Shield className="w-3.5 h-3.5 text-civic-400" />
          Database Audit Trail (Immutable Version Transitions)
        </h3>

        {auditLogs.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">No transitions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase">
                <tr>
                  <th className="py-2 px-3">Timestamp</th>
                  <th className="py-2 px-3">Action</th>
                  <th className="py-2 px-3">Transition</th>
                  <th className="py-2 px-3">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {auditLogs.slice(0, 5).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 text-slate-400">{new Date(log.created_at).toLocaleTimeString()}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-civic-950 border border-civic-500/30 text-civic-400 text-[10px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {log.previous_version_code || 'NONE'} <ArrowRight className="w-3 h-3 inline text-slate-500 mx-1" /> <strong className="text-emerald-400">{log.new_version_code}</strong>
                    </td>
                    <td className="py-2 px-3 text-slate-400">{log.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: Create Custom Draft Version                                       */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-civic-400" />
                Create Custom Draft Version
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDraft} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Version Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MYS_2026_V3_CUSTOM"
                  value={draftForm.versionCode}
                  onChange={(e) => setDraftForm({ ...draftForm, versionCode: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Delimitation Notes / Description</label>
                <textarea
                  rows="2"
                  placeholder="Administrative notes for this boundary draft..."
                  value={draftForm.notes}
                  onChange={(e) => setDraftForm({ ...draftForm, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Created By</label>
                  <input
                    type="text"
                    value={draftForm.createdBy}
                    onChange={(e) => setDraftForm({ ...draftForm, createdBy: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Source</label>
                  <input
                    type="text"
                    value={draftForm.source}
                    onChange={(e) => setDraftForm({ ...draftForm, source: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <p>• Creates version with <code>status = 'DRAFT'</code> and <code>validation_status = 'PENDING'</code>.</p>
                <p>• DRAFT versions <strong>never</strong> influence live citizen routing.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg bg-civic-600 hover:bg-civic-500 text-white font-semibold"
                >
                  Create Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PostGIS Boundary Validation Breakdown                             */}
      {/* ========================================================================= */}
      {showValidateModal && selectedValidation && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-civic-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    PostGIS Boundary Validation Report
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    Version: {selectedValidation.versionCode}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowValidateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Verdict Banner */}
            <div
              className={`p-3 rounded-lg flex items-center gap-2.5 text-xs font-semibold border ${
                selectedValidation.valid
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
              }`}
            >
              {selectedValidation.valid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <div>
                <p className="font-bold">
                  Status: {selectedValidation.validationStatus} ({selectedValidation.valid ? 'PASSED' : 'REJECTED'})
                </p>
                <p className="text-[11px] font-normal opacity-90">
                  {selectedValidation.validationMessage}
                </p>
              </div>
            </div>

            {/* PostGIS Geometry Checks Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5 text-civic-400" />
                Zone Geometry Integrity
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase">
                    <tr>
                      <th className="py-2 px-2.5">Zone Name</th>
                      <th className="py-2 px-2.5">Type</th>
                      <th className="py-2 px-2.5">SRID</th>
                      <th className="py-2 px-2.5">ST_IsValid</th>
                      <th className="py-2 px-2.5">Area (km²)</th>
                      <th className="py-2 px-2.5">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {selectedValidation.details?.geometryChecks?.map((chk, i) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="py-2 px-2.5 font-sans font-medium text-white">{chk.name}</td>
                        <td className="py-2 px-2.5 text-slate-400">{chk.geometryType}</td>
                        <td className="py-2 px-2.5">{chk.srid}</td>
                        <td className="py-2 px-2.5">
                          {chk.isValid ? (
                            <span className="text-emerald-400">TRUE</span>
                          ) : (
                            <span className="text-rose-400">FALSE ({chk.invalidReason})</span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-slate-300">{chk.areaSqKm}</td>
                        <td className="py-2 px-2.5">
                          {chk.passed ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-[10px]">
                              VALID
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-500/30 text-[10px]">
                              INVALID
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Overlap & Coverage Analysis Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-civic-400" />
                  Boundary Overlap Check
                </span>
                <p className="text-[11px] text-slate-400">
                  {selectedValidation.details?.overlapCheck?.details}
                </p>
                <div className="text-[10px] text-slate-500 font-mono">
                  Threshold: &gt; 1.0 m² area overlap • Shared borders (ST_Touches) allowed
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-civic-400" />
                  Spatial Coverage & Delta
                </span>
                <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
                  <div>Proposed Area: <strong>{selectedValidation.details?.coverageCheck?.totalAreaSqKm} km²</strong></div>
                  <div>Net Change: <strong>{selectedValidation.details?.coverageCheck?.netChangeSqKm} km²</strong></div>
                </div>
                <div className="text-[10px] text-slate-500">
                  {selectedValidation.details?.coverageCheck?.syntheticDemoNotice}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowValidateModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: Safe Atomic Activation Confirmation Modal                        */}
      {/* ========================================================================= */}
      {showActivateModal && targetVersionToActivate && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                Safe Boundary Activation Confirmation
              </h3>
              <button
                onClick={() => setShowActivateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Transition comparison box */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-400">Current ACTIVE</span>
                  <p className="font-mono font-bold text-white">{activeVersion?.version_code || 'NONE'}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500" />
                <div>
                  <span className="text-[10px] uppercase font-mono text-amber-400">Proposed Version</span>
                  <p className="font-mono font-bold text-amber-300">{targetVersionToActivate.version_code}</p>
                </div>
              </div>
            </div>

            {/* Crucial Immutability & Safety Warnings */}
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Operational Impact Notice</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                • <strong>Future complaints</strong> will immediately route against the new boundary model.
              </p>
              <p className="text-[11px] leading-relaxed">
                • <strong>Historical complaints and routing decisions</strong> will remain permanently untouched, retaining their original jurisdiction version.
              </p>
              <p className="text-[11px] leading-relaxed">
                • Activation executes inside an atomic PostgreSQL transaction with row locks. If any validation fails, it rolls back leaving the active version untouched.
              </p>
            </div>

            {/* Operator and Reason Form */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Operator Name *</label>
                <input
                  type="text"
                  required
                  value={activationForm.operator}
                  onChange={(e) => setActivationForm({ ...activationForm, operator: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Activation Reason *</label>
                <input
                  type="text"
                  required
                  value={activationForm.reason}
                  onChange={(e) => setActivationForm({ ...activationForm, reason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowActivateModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmActivation}
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950/50"
              >
                Confirm & Atomically Activate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
