import React from 'react';

/**
 * MapLayerToggle
 * Clean switcher pill for switching between Standard OSM and Satellite view.
 * Displays:
 * Standard mode:  [ ● Standard ] Satellite
 * Satellite mode: Standard [ ● Satellite ]
 */
export default function MapLayerToggle({ mapLayer, onToggle, className = '' }) {
  const isStandard = mapLayer === 'standard';
  const isSatellite = mapLayer === 'satellite';

  return (
    <div
      className={`inline-flex items-center gap-1 bg-[#060a14] border border-slate-800 rounded-lg p-0.5 text-xs font-mono select-none shadow-sm ${className}`}
      role="group"
      aria-label="Map Layer Switcher"
    >
      <button
        type="button"
        onClick={() => onToggle('standard')}
        className={`px-2.5 py-1 rounded-md transition font-semibold flex items-center gap-1.5 text-xs ${
          isStandard
            ? 'bg-teal-600 text-slate-950 font-bold shadow-md'
            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
        }`}
        title="OpenStreetMap Standard Map"
      >
        <span className={isStandard ? 'text-slate-950' : 'text-slate-500'}>●</span>
        <span>Standard</span>
      </button>

      <button
        type="button"
        onClick={() => onToggle('satellite')}
        className={`px-2.5 py-1 rounded-md transition font-semibold flex items-center gap-1.5 text-xs ${
          isSatellite
            ? 'bg-teal-600 text-slate-950 font-bold shadow-md'
            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
        }`}
        title="Satellite Imagery with Road & Place Labels"
      >
        <span className={isSatellite ? 'text-slate-950' : 'text-slate-500'}>●</span>
        <span>Satellite</span>
      </button>
    </div>
  );
}
