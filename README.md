# Adaptive Civic Routing Intelligence System

**HackMysuru Sub-Problem:** Routing  
**Current Stage:** Stage 1 — Project Foundation Setup

---

## 📌 Project Overview
The **Adaptive Civic Routing Intelligence System** is an intelligent civic-tech platform designed to automate and optimize the ingestion, geospatial jurisdiction analysis, multi-agency authority routing, and real-time tracking of civic issues in Mysuru.

Stage 1 establishes the core technical foundation and verifies end-to-end communication across the stack.

---

## 🛠️ Technology Stack (Stage 1)

- **Frontend:** React (v18+), Vite, JavaScript, Tailwind CSS
- **Map & GIS Visualizer:** Leaflet, OpenStreetMap, React Leaflet
- **Backend:** Node.js, Express.js, Socket.IO, Helmet, CORS, Morgan
- **Database Layer:** PostgreSQL, PostGIS (Connection pool ready via `pg`)
- **Real-Time Layer:** Socket.IO (WebSocket connection verified)
- **Security:** Helmet headers, CORS policies, environment isolation via `dotenv`, centralized error handling
- **Version Control:** Git, structured monorepo layout

---

## 📁 Repository Structure

```
adaptive-civic-routing/
│
├── client/                      # React + Vite + Tailwind frontend
│   ├── src/
│   │   ├── components/          # Reusable UI & Map components (Header, Map, SystemStatus)
│   │   ├── pages/               # Main view pages
│   │   ├── services/            # Axios API & Socket.IO client instances
│   │   ├── hooks/               # Custom React hooks
│   │   ├── layouts/             # Page layouts
│   │   ├── utils/               # Helper utilities
│   │   ├── App.jsx              # Root application component
│   │   └── main.jsx             # Entry point
│   ├── public/                  # Public assets
│   ├── package.json             # Frontend dependencies
│   ├── tailwind.config.js       # Tailwind CSS configuration
│   ├── postcss.config.js        # PostCSS configuration
│   └── vite.config.js           # Vite configuration
│
├── server/                      # Node.js + Express backend
│   ├── src/
│   │   ├── config/              # PostgreSQL/PostGIS connection configuration
│   │   ├── controllers/         # Request handlers
│   │   ├── routes/              # API route definitions (/api/health)
│   │   ├── services/            # Business logic & socket management
│   │   ├── middleware/          # Security & error handling middleware
│   │   ├── utils/               # Server utilities
│   │   ├── app.js               # Express application configuration
│   │   └── server.js            # Server entrypoint & Socket.IO initialization
│   ├── package.json             # Backend dependencies
│   └── .env.example             # Template for environment variables
│
├── database/                    # Spatial database schema & seeds
│   ├── migrations/              # SQL schema migrations
│   └── seeds/                   # Initial seeds
│
├── docs/                        # Architecture & system design documentation
├── .gitignore                   # Git exclusion rules
├── README.md                    # Project documentation
└── package.json                 # Root script definitions
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18.x or higher)
- npm (v9.x or higher)
- PostgreSQL with PostGIS extension (optional for Stage 1; connection is gracefully checked)

### 2. Installation
Install all dependencies across client and server:
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 3. Environment Setup
Configure the backend environment variables:
```bash
cd server
cp .env.example .env
```

Ensure `.env` values match your local development settings.

### 4. Running the Application

**Run backend server:**
```bash
cd server
npm run dev
# Server starts on http://localhost:4000
```

**Run frontend client:**
```bash
cd client
npm run dev
# Client starts on http://localhost:5173
```

---

## 🧪 Stage 1 Verification Checklist
- [x] Backend Express server starts on port 4000 without errors.
- [x] `GET /api/health` returns status code 200 with `{ "success": true, "message": "Adaptive Civic Routing API is running", "stage": 1 }`.
- [x] Frontend React + Vite application starts on port 5173.
- [x] Leaflet map centers on Mysuru (`12.2958° N, 76.6394° E`) and renders OpenStreetMap tiles seamlessly.
- [x] Socket.IO client establishes bidirectional connection with backend.
- [x] PostgreSQL/PostGIS connection configuration is ready and performs non-blocking health check.
- [x] Clean civic-tech design implemented with Tailwind CSS.
- [x] Secrets and `node_modules` safely ignored via `.gitignore`.

---

## 🗺️ Roadmap & Upcoming Stages
The following features are **not** implemented in Stage 1 and will be introduced in subsequent stages:
- **Civic Complaint Intake:** Citizen-facing submission forms with geospatial pinpointing.
- **GIS Jurisdiction Detection:** PostGIS spatial queries against administrative boundaries (MCC Wards, MUDA, Gram Panchayats, PWD).
- **Adaptive Routing Engine:** Intelligent decision trees determining lead agency and secondary departments.
- **Authority Assignment & SLAs:** Rule-based ticket dispatching with escalation schedules.
- **Explainable Routing:** Human-readable explanations for why an issue was assigned to a specific jurisdiction/agency.
- **Jurisdiction Versioning:** Temporal tracking of ward boundary reclassifications and department reorganizations.
- **Real-Time Case Tracking:** Live Socket.IO event updates on ticket status and location updates.
- **Human Review Fallback:** Workflow queues for unclassified or boundary-edge cases.
- **AI-Assisted Issue Classification:** Vision and NLP pipelines for category extraction and severity assessment.
