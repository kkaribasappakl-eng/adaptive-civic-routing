# Adaptive Civic Routing Intelligence System — Architecture

**HackMysuru 1.0 — Routing Sub-Problem**  
**Current Stage:** Stage 4 of 15 (Citizen Complaint Intake & AI-Assisted Issue Classification)

---

## Architectural Principle & Separation of Concerns

> [!IMPORTANT]
> **Core Architectural Rule**:
> **AI assists issue classification. Jurisdiction and routing decisions are handled by deterministic GIS/routing logic.**

- **Assistive AI Only**: AI is used solely to assist citizens in selecting the correct civic issue category from a controlled vocabulary. AI NEVER decides jurisdiction, municipal authority, department dispatch, or routing.
- **Deterministic GIS Engine**: Jurisdiction boundaries and authority boundaries are modeled in PostGIS using SRID 4326 geometry (`MultiPolygon` for jurisdictions, `Point` for complaints). Routing is strictly determined by spatial relationship operators (`ST_Covers`, `ST_Touches`).
- **Immutable Jurisdiction Versioning**: Decoupled versioning ensures past routing decisions remain permanent, while new tickets route against the single active version (`MYS_2026_V1` or `MYS_2026_V2`).

---

## Stage 4: Citizen Complaint Intake Data Model

### PostgreSQL Table: `complaints`

| Column | Type | Constraints / Details |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary Key (`gen_random_uuid()`) |
| `complaint_code` | `VARCHAR(50)` | Unique, Human-readable format: `HM-CIV-2026-XXXXXX` (via `complaint_code_seq`) |
| `description` | `TEXT` | Required (5 to 2000 characters) |
| `category` | `VARCHAR(50)` | Controlled enum check: `GARBAGE`, `ILLEGAL_DUMPING`, `POTHOLE`, `DRAINAGE`, `STREETLIGHT`, `C_AND_D_WASTE`, `WATER_LEAK`, `OTHER` |
| `category_source` | `VARCHAR(30)` | Source attribution check: `AI_SUGGESTED`, `CITIZEN_SELECTED`, `MANUAL` |
| `category_confidence` | `NUMERIC(5, 4)` | Nullable. Stored only when genuine AI returns numeric score (0.0 to 1.0) |
| `photo_url` | `VARCHAR(255)` | Relative URL reference (e.g. `/uploads/complaints/complaint-...jpg`) |
| `location` | `GEOMETRY(Point, 4326)` | PostGIS spatial Point geometry (`ST_SetSRID(ST_MakePoint(lng, lat), 4326)`) |
| `latitude` | `NUMERIC(10, 7)` | Range check [-90, 90] |
| `longitude` | `NUMERIC(10, 7)` | Range check [-180, 180] |
| `citizen_contact` | `VARCHAR(100)` | Optional contact reference |
| `status` | `VARCHAR(30)` | Initial status: `SUBMITTED` |
| `metadata` | `JSONB` | Additional telemetry (duplicate flags, client platform) |
| `created_at` | `TIMESTAMPTZ` | Default `CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | Default `CURRENT_TIMESTAMP` |

### Spatial & Performance Indexes
- `idx_complaints_location`: GiST index on `location` for fast proximity search and spatial containment.
- `idx_complaints_code`: B-tree index on `complaint_code`.
- `idx_complaints_category`: B-tree index on `category`.
- `idx_complaints_status`: B-tree index on `status`.
- `idx_complaints_created_at`: B-tree index on `created_at DESC`.

---

## Photo Evidence Handling
- **Upload Mechanism**: Multipart form data processed by `multer`.
- **MIME Validation**: Restricted to `image/jpeg`, `image/png`, `image/webp`. Executables and scripts are rejected with HTTP 400.
- **Size Limitation**: Capped at 5 MB.
- **Safe Server-Side Filenames**: Randomized unique hashes (`complaint-${Date.now()}-${randomBytes(8)}${ext}`). The original filename provided by the client is never trusted.
- **Storage Location**: Local controlled directory `server/uploads/complaints/`. Documented as prototype MVP infrastructure.
- **Database Reference**: Only the sanitized relative path (`/uploads/complaints/...`) is persisted.

---

## AI-Assisted Issue Classification
- **Provider**: Google Gemini API (`gemini-1.5-flash`).
- **Conditionality**:
  - If `GEMINI_API_KEY` is configured in `server/.env`: Sends complaint description and optional photo for classification against the controlled category vocabulary.
  - If `GEMINI_API_KEY` is not configured: The service cleanly returns `{ available: false, category: null, confidence: null, reason: "..." }`. The system **never fakes** AI results.
- **Category Validation**: Raw AI output is strictly validated against the controlled vocabulary before being presented to the citizen.
- **Citizen Override**:
  - If citizen confirms the AI recommendation: `category_source = 'AI_SUGGESTED'`.
  - If citizen overrides the AI recommendation: `category_source = 'CITIZEN_SELECTED'`.
  - If citizen selects manually without AI: `category_source = 'MANUAL'`.

---

## Proximity & Duplicate Warning Protection
- Before finalizing submission, the backend executes a PostGIS proximity search:
  ```sql
  SELECT complaint_code, ROUND(ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography)::numeric, 1) AS distance_meters
  FROM complaints
  WHERE category = $category
    AND created_at >= NOW() - INTERVAL '7 days'
    AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography, 100);
  ```
- **Non-Blocking Rule**: If nearby reports match, a warning banner is provided to the citizen (`possible_duplicate: true`). The report is NOT rejected, allowing recurring or distinct incidents at the same spot to be recorded.

---

## Real-Time Gateway (Socket.IO)
- When a complaint is inserted into PostgreSQL, the backend emits:
  - Event: `complaint:created`
  - Safe Payload:
    ```json
    {
      "id": "0096d79e-af91-42c7-9e78-07e8343c2ac0",
      "complaintCode": "HM-CIV-2026-000001",
      "description": "...",
      "category": "POTHOLE",
      "categorySource": "MANUAL",
      "latitude": 12.2958,
      "longitude": 76.6394,
      "status": "SUBMITTED",
      "hasPhoto": true,
      "createdAt": "2026-09-18T14:32:15.123Z"
    }
    ```
- Uploaded file filesystem paths and sensitive credentials are never broadcast over the websocket.

---

## Stage 4 Limitations & Architectural Boundaries
- **No Authority Routing in Stage 4**: Stage 4 focuses purely on complaint intake, photo evidence, PostGIS Point location storage, and issue classification.
- **Stage 5 Handoff**: The saved complaint coordinates (`geometry(Point, 4326)`) are primed for Stage 5, where the GIS routing engine will execute spatial point-in-polygon queries against the active jurisdiction version (`MYS_2026_V1` or `MYS_2026_V2`) to assign municipal authority and department.
