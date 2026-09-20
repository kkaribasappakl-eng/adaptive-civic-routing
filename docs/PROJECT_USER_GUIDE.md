# Adaptive Civic Routing Intelligence System
## Official Project User Guide & Live Demonstration Manual
**HackMysuru 1.0 — Civic Routing Sub-Problem**

---

## Table of Contents
1. [Part 1 — What the Project Does](#part-1--what-the-project-does)
2. [Part 2 — Complete Complaint Lifecycle](#part-2--complete-complaint-lifecycle)
3. [Part 3 — Citizen Portal](#part-3--citizen-portal)
4. [Part 4 — Routing Engine](#part-4--routing-engine)
5. [Part 5 — Operator Review (Human-in-the-Loop)](#part-5--operator-review-human-in-the-loop)
6. [Part 6 — Jurisdictions & Version Management](#part-6--jurisdictions--version-management)
7. [Part 7 — Operational Analytics Dashboard](#part-7--operational-analytics-dashboard)
8. [Part 8 — Immutable Audit Trail](#part-8--immutable-audit-trail)
9. [Part 9 — User Roles & Access Control (RBAC)](#part-9--user-roles--access-control-rbac)
10. [Part 10 — Map & Spatial GIS Foundation](#part-10--map--spatial-gis-foundation)
11. [Part 11 — Service Level Agreements (SLA)](#part-11--service-level-agreements-sla)
12. [Part 12 — Real-Time Notifications & Socket.IO](#part-12--real-time-notifications--socketio)
13. [Part 13 — Step-by-Step Demo Scenarios](#part-13--step-by-step-demo-scenarios)
14. [Part 14 — 10-Minute Live Pitch / Demo Script](#part-14--10-minute-live-pitch--demo-script)
15. [Part 15 — Troubleshooting & Diagnostics Guide](#part-15--troubleshooting--diagnostics-guide)
16. [Part 16 — Localhost Setup & Operational Commands](#part-16--localhost-setup--operational-commands)
17. [Part 17 — Pre-Demo Final System Checklist](#part-17--pre-demo-final-system-checklist)
18. [Part 18 — 10 Critical Concepts for Judges & Evaluators](#part-18--10-critical-concepts-for-judges--evaluators)

---

## Part 1 — What the Project Does

### The Problem
In urban civic governance across Indian cities like Mysuru, citizen complaints frequently suffer from jurisdictional confusion:
* Is an overflowing garbage heap near Chamundi Foothills under **Mysuru City Corporation (MCC)** or **Mysuru Urban Development Authority (MUDA)**?
* Which specific department is responsible: Solid Waste Management, Roads, or Town Planning?
* What happens when municipal ward boundaries are updated or redrawn?

Traditionally, complaints bounce across departments for weeks, get rejected without clear reasons, or require manual redispatch.

### The Solution: Adaptive Civic Routing Intelligence System
This system is an automated, explainable, and deterministic routing intelligence platform designed specifically for civic grievances. It eliminates guesswork and jurisdictional deadlock by separating **classification assistance** from **jurisdiction and authority resolution**:

```
Citizen Grievance Submission
        │
        ▼
[1] AI Classification Assistance (Gemini API)
    └── Predicts issue category (e.g., POTHOLE, WATER_LEAK) with confidence score.
    └── Citizen or Operator retains ultimate confirmation power.
        │
        ▼
[2] PostGIS Spatial Containment (EPSG:4326 / ST_Covers)
    └── Evaluates exact latitude & longitude against active polygon boundaries.
    └── Deterministically identifies the exact administrative zone (e.g., MCC Zone 1 vs. MUDA Zone 1).
        │
        ▼
[3] Deterministic Civic Mapping Engine
    └── Maps (Jurisdiction Boundary + Category) ➔ (Authority + Department).
    └── Generates a fully explainable, auditable spatial reason.
        │
        ▼
[4] Automated Intake Lifecycle
    └── Creates immutable routing decision ledger.
    └── Computes category-specific SLA deadlines (Target & Warning hours).
    └── Emits real-time Socket.IO events and persists in-app notifications.
    └── Directs boundary exceptions & unmapped issues to Operator Human Review.
    └── Streams verified data to Analytics and Immutable Audit Logs.
```

### Architectural Golden Rule
> **CRITICAL ARCHITECTURAL DISTINCTION:**
> * **AI does NOT decide jurisdiction.**
> * **AI does NOT decide authority.**
> * **AI does NOT decide department.**
>
> Artificial Intelligence is strictly confined to semantic issue classification (interpreting what the problem is from the citizen's description). **PostgreSQL/PostGIS spatial topology (`ST_Covers`) and deterministic database mapping tables decide who is legally responsible.**

---

## Part 2 — Complete Complaint Lifecycle

Here is the exact journey of a complaint from citizen submission to final resolution:

```
+----------------------------------------------------------------------------------------------------+
|                                    END-TO-END COMPLAINT TIMELINE                                   |
+----------------------------------------------------------------------------------------------------+
 1. INTAKE (Citizen Portal)
    Citizen opens Portal ➔ enters description (min 5 chars) ➔ uploads mandatory photo (JPEG/PNG/WebP,
    max 5MB) ➔ enters mandatory Indian phone number (10-digit, normalized to +91XXXXXXXXXX) ➔
    clicks "Ask AI to Classify" (or manually selects) ➔ clicks Leaflet map to pinpoint GPS coordinates.

 2. POSTGIS PERSISTENCE & SEQUENCE NUMBERING
    POST /api/complaints receives multipart payload ➔ generates monotonic sequence code
    (HM-CIV-2026-XXXXXX) ➔ stores PostGIS Point geometry `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.

 3. AUTOMATIC POSTGIS SPATIAL RESOLUTION
    Complaint is immediately evaluated against the currently ACTIVE jurisdiction version:
    `ST_Covers(jurisdiction.geom, complaint.location)`
    - Inside Active Boundary ➔ Matches Authority (MCC or MUDA) & Jurisdiction Zone.
    - Outside All Boundaries ➔ Flagged for `HUMAN_REVIEW` without inventing an authority.

 4. DETERMINISTIC DEPARTMENT MAPPING
    Matches Category + Authority in `department_mappings` table:
    - POTHOLE + MCC ➔ Roads & Infrastructure
    - GARBAGE + MCC ➔ Solid Waste Management
    - WATER_LEAK + MCC ➔ Water Supply & Sewerage (Vani Vilas Water Works)
    - STREETLIGHT + MCC ➔ Electrical & Streetlighting
    - OTHER ➔ Flags for `HUMAN_REVIEW` with department "Human Review Queue".

 5. DECISION LEDGER & IMMUTABILITY
    Writes a permanent row in `routing_decisions` linking:
    `complaint_id`, `authority_id`, `department_id`, `jurisdiction_id`, `jurisdiction_version_id`.
    Historical decisions remain permanently bound to this version even if boundaries change later.

 6. SLA BENCHMARK INITIALIZATION
    Initializes SLA row in `complaint_sla` using calibrated benchmarks:
    - WATER_LEAK: 12h target / 8h warning
    - STREETLIGHT: 24h target / 16h warning
    - GARBAGE: 24h target / 18h warning
    - DRAINAGE / ILLEGAL DUMPING: 48h target / 36h warning
    - POTHOLE / C&D WASTE: 72h target / 48h warning
    - OTHER: 96h target / 72h warning.

 7. REAL-TIME CITIZEN NOTIFICATIONS
    Persists `COMPLAINT_SUBMITTED` and `ROUTING_COMPLETED` (or `HUMAN_REVIEW_REQUIRED`) in
    `citizen_notifications` ➔ broadcasts Socket.IO events to connected clients.

 8. CASE TRACKER & OPERATOR DISPATCH
    Citizen tracks progress in Case Tracker Modal using complaint code.
    Operator opens Review Workspace or Status Manager ➔ updates status:
    `ROUTED` ➔ `IN_PROGRESS` ➔ `RESOLVED` ➔ `CLOSED`.
    Illegal status jumps (e.g. `CLOSED` ➔ `IN_PROGRESS`) are strictly blocked by state machine.

 9. AUDIT & ANALYTICS
    PostgreSQL trigger logs write-once records into `audit_logs`.
    Live complaints appear instantly on Analytics Spatial Distribution Map without AI fabrication.
+----------------------------------------------------------------------------------------------------+
```

---

## Part 3 — Citizen Portal

The **Citizen Portal** is the public entry point for civic grievance filing and real-time tracking.

### Portal Features & UI Layout
* **Description Input:** Requires at least 5 characters. Clear placeholder prompts for street name, landmarks, and issue specifics.
* **Photo Evidence Upload (* Mandatory):**
  * File size limit: Up to 5MB.
  * Supported formats: JPEG, PNG, WebP. Executable or non-image files are rejected with HTTP 400 `VALIDATION_ERROR`.
  * Visual image preview with file size indicator and instant remove option.
* **Citizen Mobile Number (* Mandatory):**
  * Strictly accepts valid 10-digit Indian mobile numbers (starting with 6, 7, 8, or 9).
  * Automatically handles prefixes (`+91`, `91`, `0`) and normalizes to canonical E.164 format: `+91XXXXXXXXXX`.
  * **Privacy Guarantee:** Citizen phone numbers are strictly protected. They are never exposed in public feeds, public tracking modals, map popups, Socket.IO broadcasts, or analytics payloads. Only authenticated `OPERATOR` and `ADMIN` users can view the phone number for field dispatch.
* **Category Selection & AI Assistant:**
  * Controlled 8 categories: `GARBAGE`, `ILLEGAL_DUMPING`, `POTHOLE`, `DRAINAGE`, `STREETLIGHT`, `C_AND_D_WASTE`, `WATER_LEAK`, `OTHER`.
  * **Ask AI to Classify Button:** Calls `POST /api/complaints/classify`.
    * If Gemini API is configured: Returns predicted category, confidence score (e.g., 94%), and reasoning.
    * If Gemini API is offline/rate-limited: Transparently displays fallback badge without faking results or blocking submission.
    * Citizen can accept the AI suggestion or freely override it. The system tracks `category_source` as `AI_SUGGESTED` or `CITIZEN_SELECTED`.
* **Interactive Leaflet Location Pinpoint:**
  * Click anywhere on the Mysuru map to place the location pin.
  * Live coordinate display (Latitude & Longitude formatted to 4 decimal places).
  * Quick location shortcuts: Mysore Palace, Devaraja Market, Gokulam, Chamundi Foothills, Outer Ring Road.
* **Duplicate Proximity Warning:**
  * When selecting a category and location, the client pre-checks `GET /api/complaints/check-duplicate`.
  * If an identical category complaint exists within 100 meters, an advisory banner appears showing the existing complaint code and status.
  * Advisory only: Does not block citizens from submitting unique reports.
* **Submission Receipt:**
  * Displays a submission card with the generated code `HM-CIV-2026-XXXXXX`.
  * One-click "Track this Complaint" button opens the Case Tracker Modal.
* **Live Intake Feed:**
  * Real-time list of recent civic submissions.
  * Updates via Socket.IO `complaint:created` events.
  * Click any card in the feed to open its live tracking dossier.

---

## Part 4 — Routing Engine

The **Routing Engine** tab (`/routing`) is the operational command center where civic officers inspect how complaints are resolved by PostGIS and deterministic business rules.

### Top Metrics Bar
1. **Total Processed:** Total count of complaints evaluated by the routing engine.
2. **PostGIS Resolved:** Number of complaints successfully contained inside active municipal polygons (`ROUTED`).
3. **Human Review:** Complaints requiring officer intervention due to boundary exclusion or unmapped category (`HUMAN_REVIEW`).
4. **Immutability Status:** Confirms `100% Immutable` PostgreSQL routing decision ledger integrity.

### Complaint Code Search & Filter Pills
* **Search Bar:** Enter any complaint code (e.g., `HM-CIV-2026-000656`) or UUID. Case-insensitive and trims whitespace.
* **Status Filter Tabs:**
  * `All`: Complete ledger.
  * `Routed`: Successfully resolved complaints.
  * `Review`: Complaints requiring human intervention.
  * `Awaiting`: Newly registered complaints prior to routing pass.

### Decision Ledger Table Columns
* **Complaint Code:** Sequence identifier (`HM-CIV-2026-XXXXXX`).
* **Category:** Category badge (color-coded).
* **Authority:** Legally responsible civic body (e.g., `Mysuru City Corporation (DEMO)` or `Mysuru Urban Development Authority (DEMO)`).
* **Department:** Specific operating department (e.g., `Roads & Infrastructure`, `Solid Waste Management`, `Water Supply & Sewerage`).
* **Jurisdiction Zone:** postGIS polygon matched (e.g., `MCC Central Zone 1 (DEMO V2)`).
* **Jurisdiction Version:** Version active when routed (e.g., `MYS_2026_V2`).
* **Routing Status:** `ROUTED` (Green) or `HUMAN_REVIEW` (Amber).
* **Routing Method:** `GIS_RULE` (automated PostGIS resolution) or `HUMAN_REVIEW`.
* **Spatial Explanation Reason:** Truthful explanation dynamically generated from PostgreSQL values:
  > *"Complaint coordinates (12.2958° N, 76.6394° E) are covered by active jurisdiction boundary 'MCC Central Zone 1 (DEMO V2)' (MCC_ZONE_1_V2) under version MYS_2026_V2. The complaint category GARBAGE deterministically maps to department 'Solid Waste Management' under Mysuru City Corporation (DEMO)."*

---

## Part 5 — Operator Review (Human-in-the-Loop)

The **Operator Review** workspace (`/review`) manages edge cases that cannot be safely automated.

### Why Does a Complaint Enter Human Review?
1. **Outside Active Municipal Boundaries:** The complaint's GPS point is outside all configured PostGIS polygons in the currently active jurisdiction version. The system **refuses to fabricate or invent a fake authority**.
2. **Unmapped / 'OTHER' Category:** Citizen reported an issue that does not have a deterministic department mapping rule.
3. **Boundary Contention:** Coordinate falls within an overlapping disputed zone between authorities.
4. **Manual Operator Re-triage:** Supervisor flagged a case for re-evaluation.

### Review Queue & Action Workflow
1. **Queue Inspection:** Filter reviews by status (`OPEN`, `IN_REVIEW`, `RESOLVED`, `UNROUTABLE`).
2. **Claim / Start Review:** An operator clicks "Start Review" to assign the review to themselves, transitioning status to `IN_REVIEW`.
3. **Dispatch & Route to Authority:**
   * Select Authority (e.g., MCC or MUDA).
   * Select Department (e.g., Health, Town Planning, Electrical).
   * Enter Mandatory Officer Justification Note (min 10 chars).
   * Click "Route Complaint".
   * Transitions complaint to `ROUTED`, records status history, emits `routing:completed`, and writes an immutable audit record.
4. **Mark Unroutable:** If the complaint is spam, test data, or completely outside state jurisdiction, operator selects "Mark Unroutable" with justification.
5. **Return to Triage:** Resets status if additional evidence is required.

---

## Part 6 — Jurisdictions & Version Management

The **Jurisdictions** tab manages boundary lifecycles using PostGIS MultiPolygons.

### The Version Lifecycle
* **DRAFT:** New boundary proposals being created or validated. Can be updated and deleted.
* **ACTIVE:** Exactly **one** version is active in PostgreSQL at any given time. Used by the live routing engine.
* **RETIRED:** Superseded versions. Kept permanently for historical provenance. Cannot be deleted.
* **ARCHIVED:** Obsolete versions stored for compliance.

### Core Innovation: Version Immutability & Safe Activation
Consider a specific street corner near the Mysuru Outer Ring Road:
1. Under **Version 1 (MYS_2026_V1)**, this coordinate is contained in **MCC Central Zone 1**.
   * Any complaint filed under V1 routes to **Mysuru City Corporation**.
2. Administration expands the city boundaries and creates **Version 2 (MYS_2026_V2)**, transferring this zone to **MUDA Urban Extension Zone 1**.
3. **Before Activation:** V2 is validated. Live routing still resolves against V1.
4. **Activation:** Admin activates V2 (`POST /api/jurisdictions/versions/:id/activate`).
   * PostgreSQL atomicity transitions V1 ➔ `RETIRED` and V2 ➔ `ACTIVE`.
5. **After Activation:**
   * A **NEW** complaint filed at the same coordinate routes to **MUDA** under V2.
   * The **HISTORICAL** complaint filed under V1 remains permanently bound to **MCC** and **V1** in the decision ledger.
   * Historical data is never rewritten or corrupted by subsequent boundary changes.

---

## Part 7 — Operational Analytics Dashboard

The **Analytics Dashboard** (`/analytics`) provides aggregate civic metrics computed directly from PostgreSQL and PostGIS.

### Dashboard Sections
1. **Overview KPIs:** Total Intake, Routing Success Rate, SLA Compliance Rate, Active Review Count.
2. **Intake Trends:** Daily complaint volume chart (7-day, 30-day, All-time filters).
3. **Category Breakdown:** Distribution across all 8 controlled civic categories.
4. **Authority Workloads:** MCC vs. MUDA distribution with PostGIS resolution percentages.
5. **Department Performance:** Workload distribution across all 14 civic operating departments.
6. **Routing Intelligence Metrics:** Proportions of `GIS_RULE` automated vs. `HUMAN_REVIEW` decisions.
7. **SLA Health Analytics:** Real-time breakdown of `WITHIN_SLA`, `AT_RISK`, and `SLA_BREACHED`.
8. **Human Review Queue Analytics:** Resolution velocity and unroutable case breakdown.
9. **Jurisdiction Historical Provenance:** Breakdown of decisions grouped by jurisdiction version.
10. **Spatial Complaint Distribution (OpenStreetMap + PostGIS):**
    * Uses **100% Free OpenStreetMap raster tiles** (Zero CartoDB/Mapbox paid API keys required).
    * Displays real PostGIS geographic coordinates from PostgreSQL.
    * **MapAutoBounds:** Automatically centers and fits bounds to the Mysuru civic jurisdiction area, ignoring distant test outliers.
    * **Coordinate Grouping:** When multiple complaints share identical coordinates (e.g. repeated test reports at Mysore Palace), markers aggregate cleanly with the **latest complaint featured on top**.
    * **Quick Code Finder:** Search any complaint code (e.g., `000656`) to highlight the marker and open its dossier immediately.
    * **Category Quick Filter:** Switch between `All Categories`, `Garbage`, `Pothole`, `Water Leak`, etc.

---

## Part 8 — Immutable Audit Trail

The **Audit Trail** (`/audit`) provides an append-only security and operational log.

### What is Audited?
* User authentication: Successful logins, failed login attempts (with rate limit tracking), logouts.
* Complaint lifecycle: Creations, status transitions, priority modifications.
* Routing engine decisions: Automated PostGIS routings, manual operator overrides.
* Review queue actions: Claiming reviews, routing to authority, marking unroutable.
* Jurisdiction governance: Creating boundary drafts, activating versions.
* User administration: Provisioning new operators by admins.

### Immutability Guarantees
* **PostgreSQL Engine-Level Trigger:** `trg_audit_logs_immutable` executes on every `UPDATE` or `DELETE` attempt against `audit_logs` and immediately raises a fatal database exception:
  ```
  ERROR: audit_logs records are immutable and cannot be updated or deleted
  ```
* **Redaction Engine:** All audit metadata passes through `sanitizeAuditMetadata()` before insertion. Passwords, JWT secrets, Bearer tokens, cookies, and sensitive headers are permanently redacted (`[REDACTED]`).

---

## Part 9 — User Roles & Access Control (RBAC)

The system implements Role-Based Access Control enforced at both backend middleware (`requireAuth`, `requireRole`) and frontend routing:

| Feature / Action | Public / Citizen | Operator (`OPERATOR`) | Administrator (`ADMIN`) |
| :--- | :---: | :---: | :---: |
| File Citizen Complaint | Allowed | Allowed | Allowed |
| Track Public Case Dossier | Allowed | Allowed | Allowed |
| View Public Status History | Allowed | Allowed | Allowed |
| View Public SLA Timeline | Allowed | Allowed | Allowed |
| Receive Real-Time Notifications | Allowed | Allowed | Allowed |
| View Unsanitized Citizen Phone | Denied | **Allowed** | **Allowed** |
| Access Deterministic Routing Engine | Denied (403) | **Allowed** | **Allowed** |
| Claim & Resolve Human Reviews | Denied (403) | **Allowed** | **Allowed** |
| Update Case Status (`PATCH /status`) | Denied (403) | **Allowed** | **Allowed** |
| View Operational Analytics Dashboard | Denied (403) | **Allowed** | **Allowed** |
| View Spatial Distribution Map | Denied (403) | **Allowed** | **Allowed** |
| View Immutable Audit Trail | Denied (403) | **Allowed** | **Allowed** |
| View Jurisdiction Versions | Denied (403) | **Allowed** | **Allowed** |
| Create Draft Jurisdiction Version | Denied (403) | Denied (403) | **Allowed** |
| **Activate Jurisdiction Version** | Denied (403) | Denied (403) | **Allowed** |
| **Provision Operator User Accounts** | Denied (403) | Denied (403) | **Allowed** |

### Safe Demo Accounts
For presentation and evaluation purposes, the system provides one-click demo logins in the header:
* **Admin Demo:** Full administrative access (jurisdiction activation & user provisioning).
* **Operator Demo:** Operations access (routing inspection, human review, analytics, audit).
* **Citizen Demo:** Public intake, case tracking, and notifications.

---

## Part 10 — Map & Spatial GIS Foundation

### Spatial Architecture & PostGIS Standards
* **Spatial Reference System (SRID):** Standard **EPSG:4326** (WGS 84 latitude/longitude).
* **Geometry Columns:**
  * `complaints.location`: `GEOMETRY(Point, 4326)`.
  * `jurisdictions.boundary`: `GEOMETRY(MultiPolygon, 4326)`.
* **Spatial Indexing:** High-performance GiST spatial index (`idx_complaints_location_gist` and `idx_jurisdictions_boundary_gist`) for sub-millisecond point-in-polygon containment resolution.
* **Core Spatial Query:**
  ```sql
  SELECT j.id, j.name, a.name AS authority_name
  FROM jurisdictions j
  JOIN authorities a ON j.authority_id = a.id
  WHERE j.version_id = $1
    AND ST_Covers(j.boundary, ST_SetSRID(ST_MakePoint($2, $3), 4326))
  LIMIT 1;
  ```
* **Tile Rendering:** OpenStreetMap free raster tiles rendered via React Leaflet without paid API tokens.

---

## Part 11 — Service Level Agreements (SLA)

Every complaint automatically receives a calibrated SLA deadline upon deterministic routing based on municipal service standards:

| Category | Target Resolution (Hours) | Warning Threshold (Hours) | Description |
| :--- | :---: | :---: | :--- |
| **WATER_LEAK** | **12h** | 8h | Emergency potable water pipeline ruptures |
| **STREETLIGHT** | **24h** | 16h | Hazardous dark spots & traffic signals |
| **GARBAGE** | **24h** | 18h | Overflowing solid waste collection points |
| **DRAINAGE** | **48h** | 36h | Blocked storm water drains & overflow hazards |
| **ILLEGAL_DUMPING**| **48h** | 36h | Unauthorized dumping in public vacant plots |
| **POTHOLE** | **72h** | 48h | Asphalt failure & road surface defects |
| **C_AND_D_WASTE** | **72h** | 48h | Construction & demolition debris clearance |
| **OTHER** | **96h** | 72h | Complex or multi-agency citizen inquiries |

### SLA State Machine
* **WITHIN_SLA:** Current time is before the warning threshold.
* **AT_RISK:** Current time exceeds warning threshold (`warning_hours`). An `sla:warning` event is emitted.
* **SLA_BREACHED:** Current time exceeds resolution target (`target_hours`). An `sla:breached` escalation event is emitted.
* **RESOLVED / CLOSED:** SLA clock permanently stops upon terminal resolution.

---

## Part 12 — Real-Time Notifications & Socket.IO

The system maintains real-time synchronization across citizen portals and operator desks without manual browser refreshing:

### Event Pipeline
```
Database Event Persisted ➔ Socket.IO Room Broadcast ➔ UI Component Auto-Updates
```

### Event Catalog
1. `complaint:created`: Emitted upon valid complaint submission. Feeds the Live Intake Feed.
2. `routing:completed`: Broadcasts automated authority and department assignment.
3. `routing:review_required`: Broadcasts boundary exclusions to operator review queues.
4. `complaint:status_changed`: Updates Case Tracker timeline in real time.
5. `sla:warning` & `sla:breached`: Signals SLA health warnings to analytics and case dossiers.
6. `notification:created`: Delivers toast alerts to the Notification Bell Center.
7. `jurisdiction:version_activated`: Alerts all clients that active GIS boundaries have switched.

---

## Part 13 — Step-by-Step Demo Scenarios

Follow these exact scenarios during evaluations:

### Scenario A: Normal Inside-Boundary Complaint (MCC Central)
1. **Navigate:** Open **Citizen Portal** (`activeTab: complaints`).
2. **Enter Description:** `Major pothole causing vehicle damage near Mysore Palace North Gate.`
3. **Upload Photo:** Select any sample JPG/PNG/WebP image (e.g. `complaint.jpg`).
4. **Enter Phone:** `9845012345`.
5. **AI Classification:** Click **Ask AI to Classify** ➔ AI selects `POTHOLE`.
6. **Location Pin:** Click the **Mysore Palace** shortcut or click coordinates `(12.2958, 76.6394)`.
7. **Submit:** Click **Submit Complaint**.
8. **Verify Result:**
   * Green receipt card appears with code `HM-CIV-2026-XXXXXX`.
   * Switch to **Routing Engine** tab (via Operator Demo login).
   * Enter code in Search Bar.
   * **Observed Status:** `ROUTED`.
   * **Authority:** `Mysuru City Corporation (DEMO)`.
   * **Department:** `Roads & Infrastructure`.
   * **Jurisdiction:** `MCC Central Zone 1 (DEMO V2)`.
   * **SLA Target:** Exactly 72 Hours.

### Scenario B: Outside-Boundary Complaint (No Invented Authority)
1. **Navigate:** Open **Citizen Portal**.
2. **Enter Description:** `Water leaking from broken pipe on highway far outside city limits.`
3. **Upload Photo & Phone:** Attach photo, enter `9845099999`.
4. **Location Pin:** Click on a point outside Mysuru boundaries (or coordinates `28.6139, 77.2090`).
5. **Submit:** Click **Submit Complaint**.
6. **Verify Result:**
   * Switch to **Routing Engine** tab.
   * **Observed Status:** `HUMAN_REVIEW`.
   * **Authority:** Displays truthful `None (Outside Boundaries)`. The engine **did not fabricate an authority**.
   * **Reason:** Explains that coordinates failed spatial containment under the active version.
   * Switch to **Operator Review** tab ➔ Locate complaint in Human Review Queue.

### Scenario C: Category 'OTHER' (Unmapped Category Fallback)
1. **Navigate:** Open **Citizen Portal**.
2. **Enter Description:** `Civic dispute regarding stray cattle grazing in municipal botanical garden.`
3. **Upload Photo & Phone:** Attach photo, enter `9845011111`.
4. **Category:** Select `OTHER`.
5. **Location Pin:** Mysore Palace `(12.2958, 76.6394)`.
6. **Submit:** Complaint is created.
7. **Verify Result:**
   * Coordinates are inside MCC Central Zone 1, but category is `OTHER`.
   * Status: `HUMAN_REVIEW`.
   * Jurisdiction & Authority are preserved (`MCC Central Zone 1`), but Department displays `Human Review Queue`.
   * Operator can open Review Workspace and manually assign the specialized department.

### Scenario D: Boundary Version Activation & Immutability
1. **Navigate:** Log in as **Admin Demo** ➔ Open **Jurisdictions** tab.
2. **Inspect Version:** Observe active version `MYS_2026_V2`.
3. **Review Immutability:** Historical decisions under V1 permanently retain `MYS_2026_V1`.
4. **Explain to Judges:** Activating a version changes the routing for future complaints without altering the legal record of previously routed complaints.

### Scenario E: Live Analytics Inspection
1. **Navigate:** Log in as **Operator Demo** ➔ Open **Analytics** tab.
2. **Scroll to Section 10:** Spatial Complaint Distribution.
3. **Observe Map:**
   * Map is centered on Mysuru (zoom 12–14).
   * Overlapping complaints at Mysore Palace are grouped into interactive markers.
   * Enter complaint code `000656` into the **Find Code** input.
   * Map immediately centers on the marker, and the popup displays `HM-CIV-2026-000656` with full authority and department details.

### Scenario F: Audit Trail Verification
1. **Navigate:** Open **Audit Trail** tab.
2. **Inspect Log:** Locate the `COMPLAINT_REGISTERED` and `COMPLAINT_ROUTED` audit records generated from Scenario A.
3. **Explain to Judges:** Every operational action is logged with IP address, user agent, actor role, and sanitized metadata, protected against tampering by PostgreSQL database triggers.

---

## Part 14 — 10-Minute Live Pitch / Demo Script

Use this timing guide during a live presentation:

* **00:00 – 01:00 (The Hook & Civic Problem):**
  Explain why municipal complaints fail in Indian cities: jurisdictional ambiguity between City Corporation (MCC) and Urban Development Authority (MUDA).
* **01:00 – 02:30 (Citizen Intake & AI Assistance):**
  Open Citizen Portal. Fill description, upload photo, enter phone number. Click "Ask AI to Classify". Explain that AI assists the citizen with categorization but does not decide legal jurisdiction.
* **02:30 – 04:00 (PostGIS Spatial Routing):**
  Pin location on map. Submit complaint. Show monotonic code `HM-CIV-2026-XXXXXX`. Explain that PostGIS `ST_Covers` instantly resolves the active polygon boundary.
* **04:00 – 05:30 (Routing Engine & Immutability):**
  Switch to Routing Engine. Search the new code. Show the deterministic resolution to MCC and Roads Department. Highlight the plain-English spatial reason.
* **05:30 – 07:00 (Human Review & Outside Boundary Handling):**
  Demonstrate an outside-boundary complaint. Show that the engine refuses to invent a fake authority and routes to Human Review. Demonstrate the operator dispatch workflow.
* **07:00 – 08:30 (Jurisdiction Versions & Analytics):**
  Show Jurisdictions tab. Explain version lifecycle (V1 vs V2). Open Analytics Dashboard. Show real PostGIS spatial distribution and live SLA metrics.
* **08:30 – 10:00 (Audit Trail & Architecture Wrap-Up):**
  Open Audit Trail. Show PostgreSQL engine-level WORM trigger. Summarize the core value: Automated, explainable, and tamper-proof civic governance.

---

## Part 15 — Troubleshooting & Diagnostics Guide

| Symptom | Probable Cause | Diagnostic Check | Resolution |
| :--- | :--- | :--- | :--- |
| **"Database service unreachable"** | PostgreSQL server stopped or bad credentials | Check `http://localhost:4000/api/health` | Start PostgreSQL service; verify `server/.env` credentials. |
| **"PostGIS extension not detected"** | PostGIS extension not enabled in database | Check `api/health/ready` or run `dbStatus.js` | Run `CREATE EXTENSION IF NOT EXISTS postgis;` in PostgreSQL. |
| **Map shows gray tiles on load** | Leaflet container size was not invalidated | Inspect console for Leaflet errors | Handled automatically by `MapInvalidator` component. |
| **AI Classification shows "Fallback"** | Missing or quota-limited Gemini API key | Check `server/.env` for `GEMINI_API_KEY` | Normal transparent fallback; citizen selects category manually. |
| **Complaint Search returns "Not Found"** | Complaint code typo or uncommitted record | Verify code in Live Feed or PostgreSQL | Ensure prefix format matches `HM-CIV-2026-XXXXXX`. |
| **Status says "Awaiting Routing"** | Auto-routing disabled or worker queued | Check decision ledger in Routing Engine | Route complaint via Routing Engine or `POST /api/complaints/:id/route`. |
| **Status says "Human Review"** | Coordinates outside boundary or category `OTHER` | Inspect `routing_reason` in decision ledger | Expected behavior; claim case in Operator Review queue. |
| **Analytics point not visible** | Point buried under overlapping older markers | Check "Find Code" input on Analytics map | Enter code in "Find Code" input; grouped popup features newest on top. |
| **Socket.IO not updating live** | Port conflict or client origin mismatch | Check WS indicator pill in Header | Ensure backend running on port 4000 and client on 5173. |
| **Login returns HTTP 401** | Incorrect credentials or expired JWT | Check browser cookies / token | Use one-click Demo Login in Header. |

---

## Part 16 — Localhost Setup & Operational Commands

### Actual System Ports & Endpoints
* **Frontend Application:** `http://localhost:5173`
* **Backend API Base:** `http://localhost:4000/api`
* **General Health Endpoint:** `http://localhost:4000/api/health`
* **Liveness Probe:** `http://localhost:4000/api/health/live`
* **Readiness Probe:** `http://localhost:4000/api/health/ready`
* **WebSocket Gateway:** `ws://localhost:4000`

### Step 1: Install Dependencies
From the repository root directory:
```bash
npm run install:all
```
*(Installs root, `server/`, and `client/` npm packages).*

### Step 2: Database Initialization & Migrations
Ensure PostgreSQL is running locally on port 5432 with database `adaptive_civic_routing`:
```bash
# Run database migrations
npm --prefix server run db:migrate

# Seed baseline authorities, boundaries, mappings, and demo accounts
npm --prefix server run db:seed

# Verify database status and PostGIS readiness
npm --prefix server run db:status
```

### Step 3: Run Development Servers
You can run both servers concurrently from the root directory:
```bash
npm run dev
```
Or start them in separate terminals:
```bash
# Terminal 1: Backend Server (Port 4000)
npm --prefix server run dev

# Terminal 2: Frontend Client (Port 5173)
npm --prefix client run dev
```

### Step 4: Build Production Bundle
To validate production compilation:
```bash
npm --prefix client run build
```

---

## Part 17 — Pre-Demo Final System Checklist

Before opening the browser for judges, run through this checklist:

* [ ] **PostgreSQL Connected:** Database `adaptive_civic_routing` is accessible on port 5432.
* [ ] **PostGIS Active:** `SELECT PostGIS_Full_Version();` returns active PostGIS 3.x.
* [ ] **Backend Listening:** Server runs cleanly on port 4000 without configuration errors.
* [ ] **Frontend Listening:** Vite dev server runs cleanly on port 5173.
* [ ] **Header Indicators Green:** Both `API` and `WS` status pills show green in the header.
* [ ] **Photo Upload Validated:** Citizen portal validates mandatory photo (<5MB, JPEG/PNG/WebP).
* [ ] **Phone Number Validated:** Citizen portal validates mandatory Indian mobile number (10 digits).
* [ ] **Automated Routing Verified:** Submitting a complaint automatically creates a `ROUTED` decision.
* [ ] **Routing Engine Search:** Complaint code lookup resolves instantly in the Routing Engine.
* [ ] **Operator Review Operational:** Human Review Queue displays unmapped and outside-boundary cases.
* [ ] **Active Jurisdiction Intact:** Exactly **one** active version (`MYS_2026_V2`) in the database.
* [ ] **Analytics Operational:** Spatial complaint distribution map renders OpenStreetMap points.
* [ ] **Audit Trail Protected:** `audit_logs` table has active `prevent_audit_log_modification` trigger.
* [ ] **SLA Trackers Accurate:** Category benchmarks correctly apply target hours (12h to 96h).
* [ ] **Git Working Tree Clean:** All modifications committed; no untracked scratch files.
* [ ] **No Secrets Exposed:** Passwords and keys redacted in code and audit metadata.

---

## Part 18 — 10 Critical Concepts for Judges & Evaluators

When explaining this project to evaluators, emphasize these 10 core architectural strengths:

1. **Deterministic Separation:** AI assists citizens with language classification, but **PostGIS and relational rules strictly decide legal jurisdiction and department**. AI never makes legal civic decisions.
2. **Real Spatial Containment:** We use true PostGIS polygon topology (`ST_Covers`) on EPSG:4326 geometry, not bounding-box approximations or simulated radius checks.
3. **Zero Invented Authorities:** If a citizen reports an issue outside the municipal boundary, the system records the real boundary exclusion reason and routes to Human Review. It **never hallucinates or invents an authority**.
4. **Historical Boundary Immutability:** When jurisdiction versions change from V1 to V2, past decisions remain permanently locked to V1. History is never rewritten.
5. **Calibrated Municipal SLAs:** Resolution targets are tailored to issue severity—emergency water leaks require 12-hour resolution, while asphalt road resurfacing is allotted 72 hours.
6. **Citizen Privacy by Design:** Mandatory phone numbers are collected for field verification, but sanitized across all public endpoints, tracking modals, and real-time feeds.
7. **Database-Enforced Audit Immutability:** The audit trail cannot be modified or deleted even by database superusers without triggering PostgreSQL exception errors.
8. **Real-Time Reactive Architecture:** Socket.IO events keep live intake feeds, operator dispatch desks, and citizen tracking modals synchronized without polling.
9. **Zero Paid Map Dependencies:** The entire spatial visualization stack operates on free, open OpenStreetMap standards without paid CartoDB or Mapbox API keys.
10. **State Machine Rigor:** Case status transitions follow strict deterministic lifecycles (`SUBMITTED` ➔ `ROUTED` ➔ `IN_PROGRESS` ➔ `RESOLVED` ➔ `CLOSED`), preventing illegal workflow skips.

---
*Adaptive Civic Routing Intelligence System • HackMysuru 1.0 Sub-Problem: Routing • Stage 15 Complete*
