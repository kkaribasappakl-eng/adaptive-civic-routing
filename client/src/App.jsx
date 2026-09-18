import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Map from './components/Map';
import SystemStatus from './components/SystemStatus';
import { checkApiHealth, getDatabaseSystemStatus } from './services/api';
import socket from './services/socket';
import { Compass, Database, Layers, ShieldCheck } from 'lucide-react';

export default function App() {
  const [apiHealth, setApiHealth] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [socketDetails, setSocketDetails] = useState(null);
  const [loading, setLoading] = useState(true);

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

    // Socket.IO event listeners
    const handleConnect = () => {
      setSocketConnected(true);
    };

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
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Stage 2 System Diagnostics */}
        <SystemStatus
          dbStatus={dbStatus}
          socketConnected={socketConnected}
          socketDetails={socketDetails}
          loading={loading}
          onRefresh={fetchSystemStatus}
        />

        {/* Map and GIS Test Section */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Map Column */}
          <div className="lg:col-span-3 min-h-[550px]">
            <Map />
          </div>

          {/* Stage 2 Information & Architectural Rules */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-civic-400" />
                Stage 2 GIS Architecture
              </h3>
              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-civic-400 mt-1.5 shrink-0" />
                  <span><strong>Spatial Standard:</strong> SRID 4326 (WGS 84). Convention: Longitude = X, Latitude = Y.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-civic-400 mt-1.5 shrink-0" />
                  <span><strong>PostGIS Core:</strong> MultiPolygon boundaries with spatial GiST indexing.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-civic-400 mt-1.5 shrink-0" />
                  <span><strong>Versioning:</strong> Decoupled `jurisdiction_versions` for immutable historical routing decisions.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-civic-400 mt-1.5 shrink-0" />
                  <span><strong>Edge Handling:</strong> Ambiguous boundary-edge coordinates flagged for Human Review.</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 text-xs text-slate-400">
              <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-civic-400" />
                Real GIS Pipeline Proof
              </h4>
              <p className="leading-relaxed">
                Coordinate Probe: <br/>
                <code className="text-[11px] text-civic-300 font-mono">
                  Map Click → /api/gis/test → ST_Covers → Active Version → Authority
                </code>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Civic Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-4 text-center text-xs text-slate-500">
        Adaptive Civic Routing Intelligence System • HackMysuru Sub-Problem: Routing • Stage 2: Database & GIS Foundation
      </footer>
    </div>
  );
}
