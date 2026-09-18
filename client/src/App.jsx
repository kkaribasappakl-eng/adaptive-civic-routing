import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Map from './components/Map';
import SystemStatus from './components/SystemStatus';
import { checkApiHealth } from './services/api';
import socket from './services/socket';
import { Layers, Compass, ShieldAlert, Cpu } from 'lucide-react';

export default function App() {
  const [apiHealth, setApiHealth] = useState(null);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [socketDetails, setSocketDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    const health = await checkApiHealth();
    setApiHealth(health);
    setLoading(false);
  };

  useEffect(() => {
    fetchHealth();

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
        {/* Foundation System Status */}
        <SystemStatus
          apiHealth={apiHealth}
          socketConnected={socketConnected}
          socketDetails={socketDetails}
          loading={loading}
          onRefresh={fetchHealth}
        />

        {/* Map Section */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Map Column (3 cols on large screen) */}
          <div className="lg:col-span-3 min-h-[500px]">
            <Map />
          </div>

          {/* Foundation Info Panel (1 col) */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <Compass className="w-4 h-4 text-civic-400" />
                Stage 1 Scope Control
              </h3>
              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span><strong>React + Vite + Leaflet:</strong> Foundation map rendered with OSM tiles.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span><strong>Node + Express:</strong> Health endpoint & security middleware active.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span><strong>Socket.IO:</strong> Live WebSocket handshake active.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span><strong>PostgreSQL/PostGIS:</strong> Configuration ready with non-blocking checks.</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 text-xs text-slate-400">
              <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-civic-400" />
                Upcoming Modules
              </h4>
              <p className="leading-relaxed">
                Complaint submission, GIS polygon boundary mapping, rule-based adaptive routing, and AI classification will be unlocked sequentially in Stages 2 through 15.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Civic Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-4 text-center text-xs text-slate-500">
        Adaptive Civic Routing Intelligence System • HackMysuru Sub-Problem: Routing • Stage 1 Foundation
      </footer>
    </div>
  );
}
