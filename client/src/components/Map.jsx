import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, Info, Search, CheckCircle2, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { testGisCoordinates, getJurisdictionBoundaries } from '../services/api';

import CivicMapLayers from './CivicMapLayers';
import MapLayerToggle from './MapLayerToggle';

// Fix default Leaflet icon paths in Vite bundles
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Mysuru Central Coordinates
const MYSURU_CENTER = [12.3100, 76.6350];
const DEFAULT_ZOOM = 12;

// Map click handler component to capture coordinates
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function Map({ activeVersionCode, targetCoord }) {
  const [selectedCoord, setSelectedCoord] = useState({ lat: 12.2958, lng: 76.6394 });
  const [probeResult, setProbeResult] = useState(null);
  const [boundaries, setBoundaries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedVersionOverride, setSelectedVersionOverride] = useState('');
  const [mapLayer, setMapLayer] = useState('standard');

  // Load boundaries GeoJSON whenever activeVersionCode changes
  useEffect(() => {
    const fetchBoundaries = async () => {
      const res = await getJurisdictionBoundaries(activeVersionCode || null);
      if (res.success && res.data) {
        setBoundaries(res.data);
      }
    };
    fetchBoundaries();
  }, [activeVersionCode]);

  // Sync if an external coordinate is passed (e.g. from VersionManager preview)
  useEffect(() => {
    if (targetCoord && targetCoord.lat && targetCoord.lng) {
      runGisProbe(targetCoord.lat, targetCoord.lng);
    }
  }, [targetCoord]);

  const runGisProbe = async (lat, lng, versionOverride = selectedVersionOverride) => {
    setLoading(true);
    setSelectedCoord({ lat, lng });
    const res = await testGisCoordinates(lat, lng, versionOverride || null);
    setProbeResult(res);
    setLoading(false);
  };

  const handlePresetSelect = (lat, lng) => {
    runGisProbe(lat, lng);
  };

  // GeoJSON polygon styling
  const getFeatureStyle = (feature) => {
    const authCode = feature.properties.authorityCode;
    const status = feature.properties.versionStatus;
    const isDraft = status === 'DRAFT';
    const isRetired = status === 'RETIRED';

    const baseColor = authCode === 'MCC_DEMO' ? '#0284c7' : '#10b981';

    return {
      color: isRetired ? '#64748b' : baseColor,
      weight: isDraft ? 2.5 : 2,
      fillColor: isRetired ? '#475569' : baseColor,
      fillOpacity: isRetired ? 0.12 : isDraft ? 0.28 : 0.22,
      dashArray: isDraft ? '5, 5' : isRetired ? '2, 4' : null
    };
  };

  const onEachFeature = (feature, layer) => {
    const props = feature.properties;
    const statusLabel = props.versionStatus === 'ACTIVE' 
      ? '<span style="color:#34d399; font-weight:bold;">[ACTIVE]</span>' 
      : props.versionStatus === 'DRAFT' 
      ? '<span style="color:#fbbf24; font-weight:bold;">[DRAFT PREVIEW]</span>' 
      : '<span style="color:#94a3b8; font-weight:bold;">[HISTORICAL]</span>';

    layer.bindTooltip(
      `<strong>${props.name}</strong> ${statusLabel}<br/>Authority: ${props.authorityName}<br/>Code: ${props.code} (${props.versionCode})<br/><em style="font-size:10px; color:#cbd5e1;">DEMO / SYNTHETIC BOUNDARIES</em>`,
      { sticky: true, className: 'leaflet-tooltip-dark' }
    );
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-800/90 bg-[#0d1424] shadow-2xl flex flex-col">
      {/* Map Header Toolbar with GIS Test Probe Controls */}
      <div className="px-4 py-3 bg-[#0a0f1e]/80 backdrop-blur border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-slate-300">
          <MapPin className="w-4 h-4 text-civic-400" />
          <span className="font-semibold text-white">PostGIS Spatial Probe</span>
          <span className="text-slate-400 font-mono">
            {selectedCoord.lat.toFixed(4)}° N, {selectedCoord.lng.toFixed(4)}° E
          </span>
          {activeVersionCode && (
            <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-mono text-[10px]">
              Active: {activeVersionCode}
            </span>
          )}

          {/* Satellite / Standard Layer Switcher */}
          <MapLayerToggle mapLayer={mapLayer} onToggle={setMapLayer} />
        </div>

        {/* Preset Coordinate Testing Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <span className="text-slate-400 text-xs font-sans mr-1">Presets:</span>
          <button
            onClick={() => handlePresetSelect(12.3150, 76.6500)}
            className="px-2.5 py-1 rounded bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border border-amber-500/50 transition font-bold"
            title="Coordinate X: Transfers from MCC to MUDA in V2"
          >
            ★ Coord X (12.3150, 76.6500)
          </button>
          <button
            onClick={() => handlePresetSelect(12.2958, 76.6394)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Central Palace (MCC)
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

      {/* Map Viewport Container - Medium Size (520px) */}
      <div className="w-full h-[520px] relative">
        <MapContainer
          center={MYSURU_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={true}
          className="w-full h-full"
          id="civic-map-container"
          style={{ height: '520px', width: '100%' }}
        >
          <CivicMapLayers mapLayer={mapLayer} />
          <MapClickHandler onMapClick={(lat, lng) => runGisProbe(lat, lng)} />

          {/* Real PostGIS GeoJSON Polygons */}
          {boundaries && boundaries.features && boundaries.features.length > 0 && (
            <GeoJSON
              key={`geojson-${activeVersionCode}-${boundaries.features.length}`}
              data={boundaries}
              style={getFeatureStyle}
              onEachFeature={onEachFeature}
            />
          )}

          {/* Active Probe Marker (if within valid range) */}
          {selectedCoord.lat >= -90 && selectedCoord.lat <= 90 && (
            <Marker 
              key={`probe-marker-${selectedCoord.lat}-${selectedCoord.lng}`}
              position={[selectedCoord.lat, selectedCoord.lng]}
            >
              <Popup className="custom-popup">
                <div className="p-1 text-slate-900">
                  <p className="font-bold text-sm">Probe Coordinate</p>
                  <p className="text-[11px] font-mono text-civic-700 mt-1">
                    Lat: {selectedCoord.lat.toFixed(4)} | Lng: {selectedCoord.lng.toFixed(4)}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Point tested against PostGIS ST_Covers.
                  </p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Floating GIS Resolution Overlay Panel */}
        <div className="absolute top-4 right-4 z-[500] bg-[#0d1424]/95 backdrop-blur-md p-4 rounded-2xl border border-slate-800/90 shadow-2xl text-xs max-w-sm w-full">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-civic-400" />
              PostGIS Routing Resolution
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
                      Code: {probeResult.data.jurisdiction?.code} | Version: <strong className="text-emerald-300">{probeResult.data.jurisdiction?.version}</strong>
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

        {/* Legend in bottom corner */}
        <div className="absolute bottom-4 left-4 z-[500] bg-[#0d1424]/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-800/90 shadow-lg text-xs max-w-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Layers className="w-3.5 h-3.5 text-civic-400" />
            <span>PostGIS Boundary Layers</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-3 h-3 rounded bg-sky-500/40 border border-sky-400 inline-block" />
            <span className="text-slate-300">MCC (Mysuru City Corp)</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-3 h-3 rounded bg-emerald-500/40 border border-emerald-400 inline-block" />
            <span className="text-slate-300">MUDA (Urban Dev Authority)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
