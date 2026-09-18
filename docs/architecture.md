# Adaptive Civic Routing Intelligence System - Architecture

## System Overview (Stage 1 Foundation)
The system is built as a multi-tier decoupled architecture:
1. **Frontend (React + Vite + Tailwind CSS + Leaflet):** Renders UI and GIS map layer. Interacts with backend via REST API (Axios) and WebSocket (Socket.IO).
2. **Backend (Node.js + Express + Socket.IO):** Manages API endpoints, handles real-time events, coordinates database connections, and applies security policies (Helmet, CORS, Morgan).
3. **Spatial Data Layer (PostgreSQL + PostGIS):** Handles spatial queries, jurisdiction boundaries, and civic complaint geometry.

## 15-Stage Roadmap Reference
- **Stage 1:** Project Foundation Setup (Current)
- **Stage 2-15:** Civic Complaint Intake, Boundary Polygons, PostGIS Spatial Engine, Multi-Agency Adaptive Routing, Explainability Engine, Versioning, Live Sockets & AI Classification.
