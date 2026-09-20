# Adaptive Civic Routing Intelligence System — Hard Constraints Matrix

**HackMysuru 1.0 — Civic Routing Sub-Problem**  
**Team Spark (HM26-E9C5)**

This document transparently and honestly outlines how the system handles the fundamental hard constraints of civic routing in Mysuru, reflecting the actual working implementation in the codebase.

---

## Hard Constraints Evaluation

| Constraint | Status | Implementation in System | Technical Reality & Honest Limitations |
| :--- | :---: | :--- | :--- |
| **1. Take Reports** | **✓ Handled** | • Citizen web intake form with mobile-responsive Leaflet map pin placement.<br>• Real complaint persistence in PostgreSQL with unique sequence identifiers (`HM-CIV-2026-XXXXXX`).<br>• Safe photo evidence upload with MIME enforcement (`image/jpeg`, `png`, `webp`) and 5 MB size cap.<br>• Proximity duplicate warning search (100m radius, past 7 days) without blocking submission. | Implemented and active on the deployed MVP. Citizens can submit with or without photo evidence and attach optional contact phone numbers. |
| **2. Jurisdiction** | **✓ Handled** | • Real PostGIS spatial engine (`SRID 4326`) modeling MCC and MUDA administrative wards as `MultiPolygon` geometries.<br>• Point-in-polygon containment resolution via `ST_Covers`.<br>• Boundary touch ambiguity detection via `ST_Touches`.<br>• Database-enforced single active version constraint (`uq_single_active_version`).<br>• Immutable routing decision ledger (`routing_decisions`) permanently linking historical tickets to their active version (`MYS_2026_V1` or `MYS_2026_V2`). | Fully implemented. PostGIS executes deterministic spatial queries. AI is strictly barred from deciding jurisdiction or administrative authority. |
| **3. Priority & SLA** | **✓ Handled** | • SLA monitoring with automated deadline calculation based on category severity.<br>• State machine transitions: `SUBMITTED` → `ROUTED` → `IN_PROGRESS` → `RESOLVED`.<br>• Escalation and SLA event tracking (`complaint_sla_events`).<br>• Real-time broadcast of status updates via Socket.IO gateway. | Implemented with database lifecycle tracking and operator management capabilities. |
| **4. Bad Input** | **✓ Handled** | • Strict coordinate bounding box checks (Mysuru region: Lat 12.2°–12.4° N, Lng 76.5°–76.8° E; global lat [-90, 90], lng [-180, 180]).<br>• Out-of-boundary coordinates are rejected from auto-routing and sent to the `HUMAN_REVIEW` operator queue.<br>• Text description length limits (5 to 2000 characters).<br>• Strict controlled enum vocabulary for categories.<br>• Multer file filter rejects scripts/executables with HTTP 400. | Server-side validation catches invalid inputs before database insertion. Unknown or edge coordinates are quarantined for human triage. |
| **5. Offline Operation** | **⚠ Partial** | • **Handled**: Graceful degradation when external services are unreachable (if Gemini AI is unavailable/unconfigured, system uses manual fallback without faking; if DB is offline, health endpoints return clear 503 status).<br>• **Partial**: Frontend displays clear offline/disconnected banners when WebSocket or network drops.<br>• **Not Yet**: Full offline-first local caching (Service Worker / IndexedDB store-and-forward queue) when citizen has zero connectivity is planned for Phase 2. | System degrades gracefully server-side, but submission requires an active Internet connection. No local background sync queue exists yet. |

---

## Legend
- **✓ Handled**: Fully implemented, backed by database schemas, endpoints, and verified UI flows.
- **⚠ Partial**: Graceful degradation and fallbacks implemented; client-side full offline-first caching pending Phase 2.
- **✕ Not Yet**: Not implemented in current MVP.
