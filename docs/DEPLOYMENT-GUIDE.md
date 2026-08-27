# NIRBHAYA SANCHAR — PRODUCTION DEPLOYMENT GUIDE

This guide provides step-by-step instructions for deploying both **System 1 (Nirbhaya Sanchar Connect)** and **System 2 (AI Voice Security & Fraud Detection Engine)** to production.

---

## 1. ARCHITECTURE OVERVIEW

```
                      CITIZEN / CALLER
                             │
                             ▼
                 [SYSTEM 1 FRONTEND (Vercel)]
                  https://connect.sanchar.gov.in
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
[SYSTEM 1 NODE BACKEND (Render)]      [LIVEKIT SFU CLOUD]
 https://api.connect.sanchar.gov.in     wss://livekit.sanchar.gov.in
            │                                 │
     (Real Audio Tap)                         │ (Encrypted Audio Track)
            ▼                                 ▼
[SYSTEM 2 FASTAPI + WEBSOCKET (Render)]
 https://engine.sanchar.gov.in
 wss://engine.sanchar.gov.in/ws/analysis/{call_id}
            │
            ├─► In-Memory Neural Anti-Spoof (PyTorch)
            ├─► VAD & Spectral ResNet LFCC Feature Ingestion
            ├─► Risk & Policy Fusion Engine
            │
            ├─► [POSTGRESQL DB (Managed)] — Audit & Risk Telemetry
            │
            ▼ (Signed Webhook Callback)
[SYSTEM 1 NODE BACKEND] ──► Real-Time Security HUD in Active Call Screen
```

---

## 2. SYSTEM 1: CONNECT DEPLOYMENT

### A. System 1 Backend (Node.js Express)
* **Target:** Render / Railway / AWS App Runner / Fly.io (Persistent Web Service)
* **Root Directory:** `connect/server`
* **Build Command:** `npm install`
* **Start Command:** `npm start`
* **Environment Variables:**
  ```env
  PORT=3001
  LIVEKIT_URL=wss://your-project.livekit.cloud
  LIVEKIT_API_KEY=your_livekit_api_key
  LIVEKIT_API_SECRET=your_livekit_api_secret
  FRONTEND_ORIGIN=https://connect.sanchar.gov.in
  SYSTEM1_CALLBACK_SECRET=your_secure_shared_callback_secret_2026
  ```

### B. System 1 Frontend (React 19 / Vite)
* **Target:** Vercel / Cloudflare Pages
* **Root Directory:** `connect`
* **Build Command:** `npm run build`
* **Output Directory:** `dist`
* **Environment Variables:**
  ```env
  VITE_API_BASE_URL=https://api.connect.sanchar.gov.in
  VITE_ENGINE_HTTP_URL=https://engine.sanchar.gov.in/api/v1
  VITE_ENGINE_WS_URL=wss://engine.sanchar.gov.in/ws
  ```

---

## 3. SYSTEM 2: AI VOICE SECURITY ENGINE DEPLOYMENT

### A. System 2 Backend (FastAPI + WebSocket + PyTorch AI Engine)
* **Target:** Render / Railway / AWS ECS / VPS (Persistent Web Service with WebSocket & Docker support)
* **Root Directory:** `Engine` (using `Engine/Dockerfile`)
* **Build Command:** Built via Dockerfile (`pip install -r backend/requirements.txt`)
* **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
* **Resource Sizing:** 1 vCPU, 1 GB to 2 GB RAM (Standard Web Service)
* **Environment Variables:**
  ```env
  APP_NAME=NIRBHAYA_SANCHAR_ENGINE
  ENVIRONMENT=production
  API_HOST=0.0.0.0
  DEBUG=False
  DATABASE_URL=postgresql+asyncpg://user:password@db-host:5432/nirbhaya_db
  CORS_ORIGINS=https://connect.sanchar.gov.in,https://admin.sanchar.gov.in
  SYSTEM1_BASE_URL=https://api.connect.sanchar.gov.in
  SYSTEM1_CALLBACK_URL=https://api.connect.sanchar.gov.in/api/nirbhaya/callback
  SYSTEM1_CALLBACK_SECRET=your_secure_shared_callback_secret_2026
  JWT_SECRET=your_secure_random_jwt_secret_key_here
  ```

### B. System 2 Frontend (React 18 Government Security Portal)
* **Target:** Vercel / Cloudflare Pages
* **Root Directory:** `Engine/frontend`
* **Build Command:** `npm run build`
* **Output Directory:** `dist`
* **Environment Variables:**
  ```env
  VITE_API_BASE_URL=https://engine.sanchar.gov.in
  ```

---

## 4. DATABASE MIGRATION & PRODUCTION SETUP

1. **Development:** SQLite database (`sqlite+aiosqlite:///./nirbhaya_engine.db`) runs out-of-the-box in-memory/on-disk.
2. **Production (PostgreSQL):**
   * Provision a PostgreSQL instance (e.g. Neon, Supabase, AWS RDS, or Render PostgreSQL).
   * Set `DATABASE_URL=postgresql+asyncpg://<USER>:<PASSWORD>@<HOST>:<PORT>/<DB_NAME>`.
   * On startup, FastAPI's `lifespan` hook automatically initializes table schemas via SQLAlchemy (`init_db()`).

---

## 5. HEALTH CHECK & VERIFICATION

* **System 1 Health Check:** `GET https://api.connect.sanchar.gov.in/health`
* **System 2 Health Check:** `GET https://engine.sanchar.gov.in/api/v1/health`
* **System 2 Swagger API Docs:** `GET https://engine.sanchar.gov.in/docs`
* **WebSocket Ingestion Verification:** `wss://engine.sanchar.gov.in/ws/analysis/{call_id}`
