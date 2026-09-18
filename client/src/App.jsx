import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Map from './components/Map';
import SystemStatus from './components/SystemStatus';
import VersionManager from './components/VersionManager';
import ComplaintForm from './components/ComplaintForm';
import ComplaintFeed from './components/ComplaintFeed';
import RoutingView from './components/RoutingView';
import ReviewWorkspace from './components/ReviewWorkspace';
import CaseTrackerModal from './components/CaseTrackerModal';
import { checkApiHealth, getDatabaseSystemStatus } from './services/api';
import socket from './services/socket';
import { Compass, Database, Layers, ShieldCheck, FileText, Radio, CheckCircle2, Cpu } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('complaints'); // 'complaints' | 'routing' | 'review' | 'jurisdictions'
  const [apiHealth, setApiHealth] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [socketDetails, setSocketDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeVersionCode, setActiveVersionCode] = useState('MYS_2026_V1');
  const [targetCoord, setTargetCoord] = useState(null);
  const [recentlySubmitted, setRecentlySubmitted] = useState(null);
  const [trackingComplaintId, setTrackingComplaintId] = useState(null);

  const fetchSystemStatus = async () => {
    setLoading(true);
    const [healthRes, dbRes] = await Promise.all([
      checkApiHealth(),
      getDatabaseSystemStatus()
    ]);
    setApiHealth(healthRes);
    if (dbRes.success && dbRes.data?.database) {
      setDbStatus(dbRes.data.database);
    } else {
      setDbStatus({
        connected: false,
        message: dbRes.error || 'Database offline',
        postgisInstalled: false,
        databaseName: 'adaptive_civic_routing'
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSystemStatus();

    const handleConnect = () => setSocketConnected(true);
    const handleDisconnect = () => {
      setSocketConnected(false);
      setSocketDetails(null);
    };
    const handleSystemConnected = (data) => {
      setSocketConnected(true);
      setSocketDetails(data);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('system:connected', handleSystemConnected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('system:connected', handleSystemConnected);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <Header
        socketConnected={socketConnected}
        apiHealthy={apiHealth?.success}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSelectComplaint={(id) => setTrackingComplaintId(id)}
      />

      {/* Case Tracker Modal from global notification click */}
      {trackingComplaintId && (
        <CaseTrackerModal
          complaintId={trackingComplaintId}
          onClose={() => setTrackingComplaintId(null)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {activeTab === 'complaints' ? (
          /* =================================================== */
          /* STAGE 4 — CITIZEN COMPLAINT INTAKE & CLASSIFICATION */
          /* =================================================== */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Citizen Reporting Form */}
            <div className="lg:col-span-7">
              <ComplaintForm onComplaintSubmitted={(c) => setRecentlySubmitted(c)} />
            </div>

            {/* Live Feed & Architecture Constraints */}
            <div className="lg:col-span-5 space-y-5">
              <ComplaintFeed newComplaint={recentlySubmitted} />

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Stage 5 Architecture & Routing Guarantees
                </h3>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span><strong>100% Deterministic:</strong> Routing decided purely by PostGIS spatial containment + DB category maps.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span><strong>No AI in Routing:</strong> AI assists classification only; routing logic is fully deterministic.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span><strong>Historical Immutability:</strong> Decisions permanently preserve the active version at resolution time.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span><strong>Graceful Fallbacks:</strong> Uncovered points or unmapped categories route to Human Review without inventing authority.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span><strong>Idempotency Enforced:</strong> Re-routing returns existing decision without creating duplicate records.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ) : activeTab === 'routing' ? (
          /* =================================================== */
          /* STAGE 5 — DETERMINISTIC CIVIC ROUTING ENGINE        */
          /* =================================================== */
          <RoutingView />
        ) : activeTab === 'review' ? (
          /* =================================================== */
          /* STAGE 9 — OPERATOR REVIEW & HUMAN-IN-THE-LOOP       */
          /* =================================================== */
          <ReviewWorkspace onSelectComplaint={(id) => setTrackingComplaintId(id)} />
        ) : (
          /* =================================================== */
          /* STAGES 2 & 3 — GIS FOUNDATION & JURISDICTIONS       */
          /* =================================================== */
          <div className="space-y-6">
            <SystemStatus
              dbStatus={dbStatus}
              socketConnected={socketConnected}
              socketDetails={socketDetails}
              loading={loading}
              onRefresh={fetchSystemStatus}
            />

            <VersionManager
              onVersionChange={(verCode) => setActiveVersionCode(verCode)}
              onCoordinateSelect={(lat, lng) => setTargetCoord({ lat, lng })}
            />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 min-h-[550px]">
                <Map activeVersionCode={activeVersionCode} targetCoord={targetCoord} />
              </div>

              <div className="lg:col-span-1 space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                    <Database className="w-4 h-4 text-civic-400" />
                    GIS Engine Core
                  </h3>
                  <ul className="space-y-2 text-xs text-slate-300">
                    <li>• PostGIS MultiPolygon SRID 4326</li>
                    <li>• GiST Spatial Indexing</li>
                    <li>• Single Active Version Rule</li>
                    <li>• Historical Immutability</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Civic Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-4 text-center text-xs text-slate-500">
        Adaptive Civic Routing Intelligence System • HackMysuru Sub-Problem: Routing • Stage 9: Operator Review & Human-in-the-Loop Workflow
      </footer>
    </div>
  );
}

