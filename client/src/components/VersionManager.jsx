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
  RotateCcw
} from 'lucide-react';
import {
  getJurisdictionVersions,
  setupDemoV2,
  previewCoordinateAgainstVersion,
  activateJurisdictionVersion,
  compareVersions,
  getAuditHistory,
  testGisCoordinates
} from '../services/api';

export default function VersionManager({ onVersionChange, onCoordinateSelect }) {
  const [versions, setVersions] = useState([]);
  const [activeVersion, setActiveVersion] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [operator, setOperator] = useState('Civic Administrator (Demo)');

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
  }, []);

  // 1. Prepare Proposed V2
  const handleSetupV2 = async () => {
    setLoading(true);
    setActionMessage(null);
    const res = await setupDemoV2();
    if (res.success) {
      setActionMessage({ type: 'success', text: 'Proposed Version MYS_2026_V2 created in DRAFT status.' });
      await loadData();
    } else {
      setActionMessage({ type: 'error', text: res.error || 'Failed to setup V2 proposal.' });
    }
    setLoading(false);
  };

  // 2. Preview Coordinate X against Proposed V2 side-by-side with Active Version
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

  // 3. Compare V1 and V2
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

  // 4. Activate V2
  const handleActivateV2 = async () => {
    setLoading(true);
    setActionMessage(null);
    const res = await activateJurisdictionVersion('MYS_2026_V2', operator);
    if (res.success) {
      setActionMessage({
        type: 'success',
        text: `Atomic Transition Success: ${res.data.activatedVersion.code} is now ACTIVE! Previous active version is RETIRED.`
      });
      setPreviewData(null);
      await loadData();
    } else {
      setActionMessage({ type: 'error', text: res.error || 'Activation failed.' });
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
              Jurisdiction Versioning & Delimitation (Stage 3)
            </h2>
            <p className="text-xs text-slate-400">
              PostgreSQL/PostGIS lifecycle management • Single Active Version Constraint • Immutable Routing History
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          return (
            <div
              key={ver.id}
              className={`p-4 rounded-xl border transition-all ${
                isActive
                  ? 'bg-slate-900/90 border-emerald-500/50 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/30'
                  : isDraft
                  ? 'bg-slate-900/70 border-amber-500/40 shadow-amber-950/20'
                  : 'bg-slate-900/40 border-slate-800 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-civic-400" />
                  {ver.version_code}
                </span>
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

              <p className="text-[11px] text-slate-300 line-clamp-2 mb-2">
                {ver.notes || ver.source || 'Standard municipal boundary definition'}
              </p>

              <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>Boundaries: {ver.jurisdiction_count} zones</span>
                <span>v{ver.version_number}.0</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Workflow Control Bar */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-civic-400" />
          Interactive Delimitation Workflow (Demo Simulation)
        </h3>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1. Setup V2 */}
          <button
            onClick={handleSetupV2}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <GitBranch className="w-3.5 h-3.5 text-amber-400" />
            1. Prepare Proposed V2 (DRAFT)
          </button>

          {/* 2. Preview Coordinate X */}
          <button
            onClick={handlePreviewCoordX}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Eye className="w-3.5 h-3.5 text-civic-400" />
            2. Preview Coordinate X Routing
          </button>

          {/* 3. Compare V1 vs V2 */}
          <button
            onClick={handleCompare}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            3. Compare Boundaries (Diff)
          </button>

          {/* 4. Activate V2 */}
          <button
            onClick={handleActivateV2}
            disabled={loading || activeVersion?.version_code === 'MYS_2026_V2'}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40 transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap className="w-3.5 h-3.5 text-white" />
            4. Atomically Activate MYS_2026_V2
          </button>
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
                <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono text-[10px]">CURRENT</span>
              </div>
              <p className="text-sm font-bold text-white">
                {previewData.activeResult?.authority?.name || 'Unassigned'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                Jurisdiction: {previewData.activeResult?.jurisdiction?.name} ({previewData.activeResult?.jurisdiction?.code})
              </p>
              <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                All production complaints filed right now route to this authority.
              </div>
            </div>

            {/* Proposed Routing (V2) */}
            <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-amber-300">Proposed Version (MYS_2026_V2)</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 font-mono text-[10px]">PREVIEW</span>
              </div>
              <p className="text-sm font-bold text-amber-200">
                {previewData.proposalResult?.authority?.name || 'Unassigned'}
              </p>
              <p className="text-[11px] text-amber-300/80 font-mono">
                Jurisdiction: {previewData.proposalResult?.jurisdiction?.name} ({previewData.proposalResult?.jurisdiction?.code})
              </p>
              <div className="text-[10px] text-amber-400/60 pt-1 border-t border-amber-500/20">
                PostGIS preview resolves against draft geometry without impacting live traffic.
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
              <div className="font-mono font-bold text-slate-300">{comparisonData.fromVersion?.code} ({comparisonData.fromVersion?.status})</div>
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
              <div className="font-mono font-bold text-amber-400">{comparisonData.toVersion?.code} ({comparisonData.toVersion?.status})</div>
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
    </div>
  );
}
