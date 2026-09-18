# Adaptive Civic Routing Intelligence System

**HackMysuru 1.0 — Routing Sub-Problem**  
**Stage 4: Citizen Complaint Intake & AI-Assisted Issue Classification**

An adaptive municipal routing platform that uses deterministic PostGIS spatial logic for jurisdiction assignment and AI for issue classification.

---

## Key Features Across Stages

- **Stage 1: System Baseline**: Full-stack Node.js + Express backend, React + Vite frontend, real-time Socket.IO gateway, health check endpoints.
- **Stage 2: PostGIS GIS Foundation**: Real PostgreSQL 18 + PostGIS 3.6 spatial database, `MultiPolygon` SRID 4326 jurisdiction boundaries, GiST spatial indexing, point-in-polygon resolution via `ST_Covers`, boundary edge ambiguity detection via `ST_Touches`.
- **Stage 3: Jurisdiction Versioning & Delimitation**: Database-backed jurisdiction lifecycle management (`DRAFT`, `ACTIVE`, `RETIRED`), atomic transitions with single active version constraint (`uq_single_active_version`), immutable historical routing lookup, and database audit trail (`audit_version_transitions`).
- **Stage 4: Citizen Complaint Intake & Classification**:
  - Real complaint persistence in PostgreSQL with unique sequence identifiers (`HM-CIV-2026-XXXXXX`).
  - Exact complaint location stored as PostGIS `geometry(Point, 4326)` with spatial GiST indexing.
  - Safe photo evidence upload with MIME type enforcement, 5MB limit, and sanitized filenames.
  - Assistive AI issue classification via Gemini API with transparent, non-faked manual fallback when unconfigured.
  - Controlled category vocabulary (`GARBAGE`, `ILLEGAL_DUMPING`, `POTHOLE`, `DRAINAGE`, `STREETLIGHT`, `C_AND_D_WASTE`, `WATER_LEAK`, `OTHER`).
  - Citizen override capability (`category_source: CITIZEN_SELECTED`).
  - Proximity-based duplicate warning search (100m, 7 days) without blocking civic submissions.
  - Real-time Socket.IO broadcast (`complaint:created`) streaming new complaints to all connected clients.

---

## Core Architectural Principle

> **"AI assists issue classification. Jurisdiction and routing decisions are handled by deterministic GIS/routing logic."**

AI is assistive only. Municipal authorities, jurisdictions, and departments are never decided by AI. They are evaluated deterministically by the PostGIS GIS engine.

---

## Technology Stack

- **Backend**: Node.js v22, Express v4, Socket.IO v4, Multer v1, node-postgres (`pg`) v8
- **Database**: PostgreSQL 18.6 with PostGIS 3.6 extension
- **Spatial Standard**: SRID 4326 (WGS 84, Longitude = X, Latitude = Y)
- **Frontend**: React 18, Vite 6, Tailwind CSS 3, Leaflet 1.9, React-Leaflet 4, Lucide React

---

## Running Locally

### 1. Database Setup
Ensure PostgreSQL 18 with PostGIS 3.6 is running on `localhost:5432` with database `adaptive_civic_routing`.
Run migrations:
```bash
cd server
npm run db:migrate
```

### 2. Backend Server
Configure `server/.env` with your PostgreSQL credentials:
```env
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=adaptive_civic_routing
DB_USER=postgres
DB_PASSWORD=your_password
CLIENT_URL=http://localhost:5173
NODE_ENV=development
# Optional: GEMINI_API_KEY=your_key
```
Start backend:
```bash
cd server
npm start
```

### 3. Frontend App
```bash
cd client
npm run dev
```
Open `http://localhost:5173/` in your browser.

---

## Automated Verification Suites
- Stage 3 Suite: `node server/src/scripts/testStage3.js` (19 tests)
- Stage 4 Suite: `node server/src/scripts/testStage4.js` (21 tests)
