# Presentation Screenshot Collection Checklist

**HackMysuru 1.0 — Team Spark (HM26-E9C5)**  
**Project:** Adaptive Civic Routing Intelligence System  
**Live MVP:** [https://adaptive-civic-routing.vercel.app](https://adaptive-civic-routing.vercel.app)

> [!IMPORTANT]
> **Strict Rule**: No fake UI mockups, no stock images, and no AI-generated screenshots. Every image must be captured directly from the live deployed application or verified local instance.

---

## Required Screenshot Inventory

| # | Feature / View | Target Route / UI Location | How to Trigger & Key Elements to Capture | Slide Mapping |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Citizen Login & Quick Role Switcher** | `/login` or Header Nav | • Click role selector (`Citizen`, `Operator`, `Admin`).<br>• Demonstrates RBAC authentication and role-gated access.<br>• *Key detail:* Show active badge or role banner. | Slide 8 (Proof) / Slide 3 (Users) |
| **2** | **Citizen Complaint Submission Flow** | `/` (Citizen View) | • Form with description input, Gemini AI category suggestion tag (`AI_SUGGESTED`), and photo upload preview.<br>• Leaflet map showing pin placed on Mysuru city coordinates (e.g. Sayyaji Rao Road).<br>• *Key detail:* Show proximity duplicate warning badge if nearby, or AI category badge. | Slide 4 (Solution) & Slide 8 (Proof) |
| **3** | **Automated PostGIS Routing Result** | `/` or `/routing` | • Post-submission receipt modal or routing detail card showing generated Tracking Code (`HM-CIV-2026-XXXXXX`).<br>• Shows deterministic assignment: **MCC** (Authority) → **Solid Waste Management** (Department) with `GIS_RULE` status. | Slide 4 (Solution) & Slide 8 (Proof) |
| **4** | **PostGIS Jurisdiction Map & Ward Boundaries** | `/jurisdictions` or Map View | • Full interactive Leaflet map displaying colored `MultiPolygon` boundaries for MCC Ward / MUDA zones.<br>• Active version indicator (`MYS_2026_V1` - ACTIVE).<br>• *Key detail:* Visual proof of true GIS geometry in SRID 4326. | Slide 8 (Proof) |
| **5** | **Operator Review & Triage Workspace** | `/operator` or `/reviews` | • Logged in as Operator (`operator@mysore.gov.in` / demo).<br>• Table/cards showing assigned civic tickets, SLA countdown timer, and claim button.<br>• *Key detail:* Status badges (`ROUTED`, `IN_PROGRESS`). | Slide 8 (Proof) |
| **6** | **Human Review & Boundary Disambiguation** | `/reviews` (Flagged Case) | • Ticket flagged with `HUMAN_REVIEW` due to out-of-boundary coordinate or `OTHER` category.<br>• Manual jurisdiction override dropdown allowing operator to assign authority with audit justification. | Slide 8 (Proof) |
| **7** | **Immutable Audit Trail & Version Provenance** | `/audit` or Audit Log Tab | • Log showing chronological records: timestamp, action (`ROUTING_EXECUTED`), entity ID, and immutable `jurisdiction_version_id`.<br>• *Key detail:* Demonstrates that past routing decisions are permanently auditable. | Slide 8 (Proof) |
| **8** | **Operational Analytics & Spatial Dashboard** | `/analytics` or `/dashboard` | • Bar/pie charts showing category breakdowns, automated GIS vs. manual review proportions (e.g. 85% GIS / 15% Human), and SLA compliance rates. | Slide 8 (Proof) |
| **9** | **Real-Time WebSocket State Sync** | Browser with 2 windows or Live Feed | • Live event feed showing `complaint:created` or real-time status update banner without page reload.<br>• *Key detail:* Shows active Socket.IO connection indicator ("Connected"). | Slide 8 (Proof) |
| **10** | **System Status & Health Monitor** | Footer / Status Modal | • "PostgreSQL / PostGIS Active", "Socket.IO Online", "Gemini AI Connected" status badges.<br>• Proves full-stack production health. | Slide 8 (Proof) |

---

## Slide 8 Presentation Layout Plan (Proof It Works)

In the final 10-slide presentation, Slide 8 will feature **3–4 high-impact screenshots** arranged in a clean, legible 2×2 grid:

1. **Top-Left**: *Citizen Intake & Assistive AI Classification* (Shows real form, Gemini category detection, and map pin).
2. **Top-Right**: *Deterministic PostGIS Containment & Routing* (Shows complaint receipt bound to MCC Zone and Department).
3. **Bottom-Left**: *Operator Review & Triage Workspace* (Shows operator queue with SLA tracking).
4. **Bottom-Right**: *Immutable Audit Trail / Version Provenance* (Shows audit ledger locking decision to active jurisdiction version).

---

## Screenshot Capture Guidelines
- **Resolution:** Capture at 1920×1080 (or crisp window size, min 1200px width).
- **Format:** PNG or high-quality WebP.
- **Directory:** Store captures in `docs/screenshots/` (e.g., `01_citizen_intake.png`, `02_routing_decision.png`, etc.).
- **Legibility:** Ensure typography and badges are sharp and readable when scaled down to fit on a slide.
