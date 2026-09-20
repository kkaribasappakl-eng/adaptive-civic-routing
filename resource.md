# Team Spark
**Team ID:** HM26-E9C5  
**HackMysuru 1.0 Submission Resources**

---

## Team Members
- **Hemanth N**
- **Karibasappa KL**
- **Pooja M**
- **Soumya Doddamani**

---

## Project
**Adaptive Civic Routing Intelligence System**

An adaptive municipal routing platform engineered for Mysuru's urban administration. It uses deterministic PostGIS spatial logic (`SRID 4326`) for jurisdiction boundary containment and authority routing, paired with assistive Gemini AI for civic issue categorization.

---

## Sub-problem
**Routing** (Automated civic complaint jurisdiction containment, inter-departmental dispatch, and boundary version lifecycle management)

---

## Live Working MVP
- **Production URL:** [https://adaptive-civic-routing.vercel.app](https://adaptive-civic-routing.vercel.app)
- **Status:** Active & Deployed (React + Vite on Vercel, Node.js + Express + PostGIS on Render)

---

## Presentation
- **File:** `presentation.pdf`
- **Status:** **To be added before final submission.**
- *Note for Judges:* The presentation will be compiled into `presentation.pdf` (maximum 10 slides) using exclusively verified screenshots from the live deployed MVP once all final application captures are assembled.

---

## Decision Log
- **File:** `decision-log.pdf`
- **Status:** **To be included before final submission.**
- *Note for Judges:* The concise 1-page decision log covers architectural and product trade-offs (Q1, Q2, Q3) regarding deterministic PostGIS containment vs. probabilistic routing, immutable jurisdiction versioning, and municipal scaling limits.

---

## 10-Minute Walkthrough Video
- **Link:** `[GOOGLE DRIVE WALKTHROUGH LINK — TO BE ADDED BEFORE FINAL SUBMISSION]`
- **Required Permission:** *Anyone with the link can view*
- *Note:* A comprehensive 10-minute video demonstrating the end-to-end citizen reporting journey, GIS routing engine, human review workspace, and audit provenance will be linked here prior to final deadline submission.

---

## Repository
- **GitHub Repository:** [https://github.com/kkaribasappakl-eng/adaptive-civic-routing](https://github.com/kkaribasappakl-eng/adaptive-civic-routing)
- **Branch:** `master`

---

## Project Documentation
The repository contains comprehensive technical specifications and operational manuals:

- [docs/architecture.md](docs/architecture.md): System architecture, separation of concerns (Assistive AI vs. Deterministic GIS), complaint data model, and spatial indexing.
- [docs/constraints.md](docs/constraints.md): Hard constraints matrix covering reporting intake, jurisdiction resolution, priority/SLA, bad input sanitization, and offline handling.
- [docs/PROJECT_USER_GUIDE.md](docs/PROJECT_USER_GUIDE.md): Complete step-by-step user and operator guide with test credentials and walkthroughs.
- [docs/HOW_THE_WHOLE_APPLICATION_WORKS.md](docs/HOW_THE_WHOLE_APPLICATION_WORKS.md): Exhaustive 27-part engineering manual detailing every database table, endpoint, state machine transition, and judge Q&A.
- [docs/SCREENSHOT_CHECKLIST.md](docs/SCREENSHOT_CHECKLIST.md): Verification and capture checklist for genuine application screenshots across citizen, routing, operator, and audit workflows.
- [README.md](README.md): Quick-start instructions, local setup, technology stack, and verification suites.

