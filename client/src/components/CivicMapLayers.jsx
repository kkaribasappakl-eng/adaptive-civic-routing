import React from 'react';
import { TileLayer } from 'react-leaflet';

/**
 * CivicMapLayers
 * Renders Standard OpenStreetMap or Satellite Imagery with Transparent Road & Place Labels.
 *
 * Layer hierarchy when in Satellite mode:
 * 1. Satellite Imagery (Esri World Imagery)
 * 2. Transparent Roads Overlay (Esri World Transportation)
 * 3. Transparent Place & Boundary Labels Overlay (Esri World Boundaries and Places)
 * 4. Polygons / Markers rendered above by MapContainer children
 */
export default function CivicMapLayers({ mapLayer = 'standard' }) {
  if (mapLayer === 'satellite') {
    return (
      <>
        {/* Layer 1: High-Resolution Satellite Imagery */}
        <TileLayer
          key="esri-satellite-imagery"
          attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and GIS User Community'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
        {/* Layer 2: Transparent Road Network Overlay */}
        <TileLayer
          key="esri-satellite-roads"
          attribution='Roads &copy; Esri, HERE, Garmin'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
          opacity={0.9}
        />
        {/* Layer 3: Transparent Place & Street Labels Overlay */}
        <TileLayer
          key="esri-satellite-labels"
          attribution='Labels &copy; Esri, HERE, Garmin'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
          opacity={1.0}
        />
      </>
    );
  }

  return (
    <TileLayer
      key="osm-standard-tiles"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxZoom={19}
    />
  );
}
