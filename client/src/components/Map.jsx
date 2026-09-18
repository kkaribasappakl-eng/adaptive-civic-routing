import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, Info, Search, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { testGisCoordinates } from '../services/api';

// Fix default Leaflet icon paths in Vite bundles
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Mysuru Central Coordinates
const MYSURU_CENTER = [12.2958, 76.6394];
const DEFAULT_ZOOM = 13;

// Map click handler component to capture coordinates
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function Map() {
  const [selectedCoord, setSelectedCoord] = useState({ lat: 12.2958, lng: 76.6394 });
  const [probeResult, setProbeResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runGisProbe = async (lat, lng) => {
    setLoading(true);
    setSelectedCoord({ lat, lng });
    const res = await testGisCoordinates(lat, lng);
    setProbeResult(res);
    setLoading(false);
  };

  const handlePresetSelect = (lat, lng) => {
    runGisProbe(lat, lng);
  };

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl flex flex-col">
      {/* Map Header Toolbar with GIS Test Probe Controls */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <MapPin className="w-4 h-4 text-civic-400" />
          <span className="font-semibold text-white">Mysuru GIS Probe (Stage 2)</span>
          <span className="text-slate-400 font-mono">
            {selectedCoord.lat.toFixed(4)}° N, {selectedCoord.lng.toFixed(4)}° E
          </span>
        </div>

        {/* Preset Coordinate Testing Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <span className="text-slate-400 text-xs font-sans mr-1">Test Coordinates:</span>
          <button
            onClick={() => handlePresetSelect(12.2958, 76.6394)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Central Mysuru (MCC)
          </button>
          <button
            onClick={() => handlePresetSelect(12.3400, 76.6000)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            NW Sector (MUDA)
          </button>
          <button
            onClick={() => handlePresetSelect(28.6139, 77.2090)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Outside Boundary
          </button>
          <button
            onClick={() => handlePresetSelect(999, 999)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-800/60 transition"
          >
            Invalid (999, 999)
          </button>
        </div>
      </div>

      {/* Map Viewport Container */}
      <div className="flex-1 w-full min-h-[520px] relative">
        <MapContainer
          center={MYSURU_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={true}
          className="w-full h-full"
          id="civic-map-container"
          style={{ height: '520px', width: '100%', minHeight: '520px' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <MapClickHandler onMapClick={(lat, lng) => runGisProbe(lat, lng)} />

          {/* Active Probe Marker (if within valid range) */}
          {selectedCoord.lat >= -90 && selectedCoord.lat <= 90 && (
            <Marker position={[selectedCoord.lat, selectedCoord.lng]}>
              <Popup className="custom-popup">
                <div className="p-1 text-slate-900">
                  <p className="font-bold text-sm">Probe Coordinate</p>
                  <p className="text-[11px] font-mono text-civic-700 mt-1">
                    Lat: {selectedCoord.lat.toFixed(4)} | Lng: {selectedCoord.lng.toFixed(4)}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Click "Run GIS Query" or choose a preset to test PostGIS point-in-polygon resolution.
                  </p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Floating GIS Resolution Overlay Panel */}
        <div className="absolute top-4 right-4 z-[500] bg-slate-900/95 backdrop-blur-md p-4 rounded-xl border border-slate-700/80 shadow-2xl text-xs max-w-sm w-full">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-civic-400" />
              GIS Resolution Test Result
            </span>
            <button
              onClick={() => runGisProbe(selectedCoord.lat, selectedCoord.lng)}
              disabled={loading}
              className="text-[11px] px-2 py-0.5 rounded bg-civic-600 hover:bg-civic-500 text-white font-medium flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Query
            </button>
          </div>

          {loading ? (
            <div className="py-4 text-center text-slate-400 font-mono text-xs">
              Querying PostGIS via /api/gis/test...
            </div>
          ) : probeResult ? (
            <div className="space-y-2 text-xs">
              <div className="font-mono text-[11px] text-slate-400 flex justify-between">
                <span>Lat: {selectedCoord.lat}</span>
                <span>Lng: {selectedCoord.lng}</span>
              </div>

              {probeResult.success ? (
                probeResult.data?.matched ? (
                  <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2.5 space-y-1 text-slate-200">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Jurisdiction Matched</span>
                    </div>
                    <p className="font-semibold text-white text-sm">
                      {probeResult.data.jurisdiction?.name}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Code: {probeResult.data.jurisdiction?.code} | Version: {probeResult.data.jurisdiction?.version}
                    </p>
                    <div className="mt-2 pt-1.5 border-t border-emerald-500/20 text-[11px]">
                      <span className="text-slate-400">Assigned Authority: </span>
                      <strong className="text-emerald-300">{probeResult.data.authority?.name}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-300">
                    <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Outside Jurisdiction Polygons</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {probeResult.data?.message || 'Point does not intersect any demo boundaries.'}
                    </p>
                  </div>
                )
              ) : (
                <div className="bg-rose-950/40 border border-rose-500/30 rounded-lg p-2.5 space-y-1 text-slate-300">
                  <div className="flex items-center gap-1.5 text-rose-400 font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Query Failed</span>
                  </div>
                  <p className="text-[11px] text-rose-300">
                    {probeResult.error || probeResult.data?.message || 'Unable to connect to spatial database'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Click anywhere on the map or click a preset test button above to test the PostGIS point-in-polygon resolution pipeline.
            </p>
          )}
        </div>

        {/* Disclaimer in bottom corner */}
        <div className="absolute bottom-4 left-4 z-[500] bg-slate-900/90 backdrop-blur-md p-3 rounded-lg border border-slate-700/60 shadow-lg text-xs max-w-xs">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-civic-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-200">Demo Spatial Disclaimer</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Demo jurisdiction polygons are synthetic test geometry and are not presented as official government boundaries.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
