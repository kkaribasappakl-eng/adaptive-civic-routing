import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, Info } from 'lucide-react';

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

export default function Map() {
  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl flex flex-col">
      {/* Map Header Toolbar */}
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <MapPin className="w-4 h-4 text-civic-400" />
          <span className="font-semibold text-white">Mysuru GIS Base Layer</span>
          <span className="text-slate-500 font-mono">12.2958° N, 76.6394° E</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            OpenStreetMap Tiles Active
          </span>
        </div>
      </div>

      {/* Map Viewport Container */}
      <div className="flex-1 w-full min-h-[480px] relative">
        <MapContainer
          center={MYSURU_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={true}
          className="w-full h-full"
          id="civic-map-container"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <Marker position={MYSURU_CENTER}>
            <Popup className="custom-popup">
              <div className="p-1 text-slate-900">
                <p className="font-bold text-sm">Mysuru Central Region</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Adaptive Civic Routing Intelligence System
                </p>
                <p className="text-[11px] font-mono text-civic-700 mt-1">
                  Latitude: 12.2958 | Longitude: 76.6394
                </p>
              </div>
            </Popup>
          </Marker>
        </MapContainer>

        {/* Floating Info Overlay (Clean Civic Style) */}
        <div className="absolute bottom-4 left-4 z-[500] bg-slate-900/90 backdrop-blur-md p-3 rounded-lg border border-slate-700/60 shadow-lg text-xs max-w-xs">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-civic-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-200">Stage 1 Foundation Map</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Zoom and pan controls enabled. Administrative boundaries, MCC/MUDA wards, and routing will be ingested in upcoming stages.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
