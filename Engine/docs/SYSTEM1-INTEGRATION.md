# Nirbhaya Sanchar — System 1 Integration Specification & Audit Report

**Document Version:** 1.0.0  
**Date:** 2026-08-27  
**Scope:** Integration Contract between System 1 (VoIP / WebRTC Calling Platform: `connect/`) and System 2 (AI Voice Security Engine: `Engine/`).

---

## 1. Executive Summary & Architecture Overview

System 1 (`connect/`) provides real-time peer-to-peer and group voice communications powered by LiveKit SFU.  
System 2 (`Engine/`) is an autonomous, real-time AI security engine that intercepts/receives live audio streams, processes them through anti-spoofing neural classifiers, speaker verifiers, speech-to-text context analysis, and behavioral engines, and streams live risk intelligence back into System 1 without disrupting the ongoing call.

```
+-------------------------------------------------------------------------------+
|                       SYSTEM 1: CONNECT (VOIP PLATFORM)                       |
|                                                                               |
|   [Caller Browser] <====== WebRTC (LiveKit SFU) ======> [Receiver Browser]    |
|          |                                                    |               |
|          |  Web Audio Stream / Tap                            |               |
|          +--------------------------+                         |               |
+-------------------------------------|-------------------------|---------------+
                                      | WebSocket Audio Stream  |
                                      v                         |
+---------------------------------------------------------------|---------------+
|                       SYSTEM 2: SECURITY ENGINE               |               |
|                                                               |               |
|   1. Short-Term Memory Ring Buffer                            |               |
|   2. Audio Preprocessing (16kHz Resampling, VAD, Normalization)               |
|   3. Parallel AI Analysis Pipelines:                          |               |
|      * Voice Authenticity (Deep Neural LFCC/MFCC Anti-Spoof)  |               |
|      * Speaker Verification (Cosine Similarity vs Enrolled)   |               |
|      * ASR & Context Intelligence (Phishing/OTP/Urgency)       |               |
|      * Behavioral & Transaction Risk Analysis                 |               |
|   4. Multi-Signal Dynamic Risk Fusion (0 - 100 Score)         |               |
|   5. Policy Decision Engine (CONTINUE / VERIFY / HOLD / ESCALATE)             |
|                                                               |               |
|   [WebSocket Broadcaster] ------------------------------------+               |
|            |                                                                  |
|            +---------> [HTTP Callback Service]                                |
+-----------------------------------|-------------------------------------------+
                                    |
                                    v (POST /api/nirbhaya/callback)
+-------------------------------------------------------------------------------+
|                   SYSTEM 1 BACKEND & NOTIFICATION LAYER                       |
|                                                                               |
|   Displays Security Banner / Live Risk HUD on CallScreen:                     |
|   "Security Alert: High-risk synthetic speech detected (Score 84/100)"        |
+-------------------------------------------------------------------------------+
```

---

## 2. System 1 Audit Details (15 Key Dimensions)

| Dimension | Discovered Value / Implementation Detail | Status |
| :--- | :--- | :--- |
| **1. Framework** | React 19 (`@livekit/components-react` v2.9.24, `livekit-client` v2.22.1), Vite 8.2.2, Node.js ESM | **DISCOVERED** |
| **2. Backend** | Node.js Express server (`connect/server/server.js`) listening on port `3001` (configurable via `PORT`), plus Vercel serverless functions in `connect/api/` (`token.js`, `health.js`) | **DISCOVERED** |
| **3. Frontend** | React SPA in `connect/src/` with screens: `AuthScreen.jsx`, `ContactsScreen.jsx`, `CallScreen.jsx`, `JoinScreen.jsx` | **DISCOVERED** |
| **4. Authentication** | Client-side session tokens stored in `localStorage` under `nirbhaya-session` and `nirbhaya-auth-token`. Profile schema: `{ id, name, email, phone, online_status, last_seen }`. Requests pass `Authorization: Bearer <token>` header. | **DISCOVERED** |
| **5. API Routes** | • `GET /health`<br>• `GET /api/calls?userId=<id>`<br>• `POST /api/calls`<br>• `POST /api/call-action`<br>• `POST /api/token` | **DISCOVERED** |
| **6. Call Creation Flow** | 1. User selects contact in `ContactsScreen.jsx`<br>2. Client sends `POST /api/calls` with `{ receiverId }`<br>3. Server creates call object in memory with status `RINGING`<br>4. Receiver accepts via `POST /api/calls` (`action: "accept"`), transitioning status to `ACCEPTED`<br>5. Both parties join LiveKit room using token generated by `POST /api/token` | **DISCOVERED** |
| **7. Call ID Format** | Standard UUID v4 string (generated via `crypto.randomUUID()` in `connect/server/server.js`) | **DISCOVERED** |
| **8. Caller ID** | String identifier from caller profile (`caller.id`, e.g. `"john-doe"`, or UUID) | **DISCOVERED** |
| **9. Receiver ID** | String identifier of the target contact (`receiver.id`) | **DISCOVERED** |
| **10. LiveKit Config** | Connected to LiveKit Cloud SFU via `LIVEKIT_URL` (starts with `wss://`), authenticated with `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Tokens generated with 10-minute TTL and grants: `roomJoin: true, room: <roomName>, canPublish: true, canSubscribe: true, canPublishData: false`. | **DISCOVERED** |
| **11. Room Naming** | Dynamic room string assigned during call creation (`roomName` in call object, e.g. `room-<uuid>` or custom alphanumeric room identifier). | **DISCOVERED** |
| **12. Database** | In-memory `Map()` store in `connect/server/server.js` (`const calls = new Map()`) and `localStorage` caching in the browser. No external SQL database in System 1. | **DISCOVERED** |
| **13. Environment Vars** | • `PORT` (default 3001)<br>• `LIVEKIT_URL`<br>• `LIVEKIT_API_KEY`<br>• `LIVEKIT_API_SECRET`<br>• `FRONTEND_ORIGIN`<br>• `VITE_API_BASE_URL` | **DISCOVERED** |
| **14. Call Status Flow** | `RINGING` &rarr; `ACCEPTED` (or `REJECTED`, `CANCELLED`) &rarr; `ENDED` | **DISCOVERED** |
| **15. Safe Integration Point** | Dual-channel integration without breaking existing calls:<br>1. **Audio Ingestion:** Client-side Web Audio PCM streaming via WebSocket from active LiveKit remote track in `CallScreen.jsx` to System 2 at `ws://localhost:8000/ws/analysis/{callId}` (and optional server-side LiveKit bot subscriber).<br>2. **Risk Streaming:** LiveKit HUD connects to `ws://localhost:8000/ws/analysis/{callId}` for sub-second UI updates.<br>3. **Server Callback:** System 2 sends HTTP POST notifications to `POST /api/nirbhaya/callback` on System 1 server. | **DISCOVERED** |

---

## 3. Discovered Integration Contract

### A. System 2 REST Endpoints consumed by System 1

#### 1. Start Analysis Session
- **Route:** `POST http://localhost:8000/api/v1/analysis/start`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
```json
{
  "call_id": "018e47b3-82a1-7690-a192-800fc49e3bf1",
  "caller_id": "user-alice",
  "receiver_id": "user-bob",
  "organization_id": "org_gov_in",
  "channel": "VOIP",
  "transaction": {
    "transaction_id": "TX-990124",
    "amount": 250000.0,
    "currency": "INR",
    "sensitivity": "HIGH",
    "beneficiary_account": "IN910002938102"
  }
}
```
- **Response (`201 Created`):**
```json
{
  "analysis_id": "018e47b3-82a1-7690-a192-800fc49e3bf1",
  "call_id": "018e47b3-82a1-7690-a192-800fc49e3bf1",
  "status": "STARTED",
  "websocket_url": "ws://localhost:8000/ws/analysis/018e47b3-82a1-7690-a192-800fc49e3bf1",
  "created_at": "2026-08-27T19:20:00.000Z"
}
```

---

### B. Real-Time WebSocket Streaming Protocol

- **URL:** `ws://localhost:8000/ws/analysis/{analysis_id}`
- **Direction:** Bidirectional (Audio Chunks from Client &rarr; Engine; Risk Events from Engine &rarr; Client)

#### 1. Audio Ingestion Frame (Client &rarr; Engine)
- Binary audio data: 16kHz mono Float32 or PCM 16-bit WAV/raw bytes, streamed in 2–4 second window chunks.

#### 2. Risk Update Event (Engine &rarr; Client)
```json
{
  "event": "RISK_UPDATED",
  "analysis_id": "018e47b3-82a1-7690-a192-800fc49e3bf1",
  "window_index": 3,
  "risk_score": 78.4,
  "risk_level": "HIGH",
  "overall_confidence": 0.94,
  "synthetic_probability": 82.5,
  "speaker_similarity": 34.1,
  "context_score": 70.0,
  "reasons": [
    "Elevated synthetic-speech / voice impersonation signal (82.5% estimated synthetic probability)",
    "Speaker identity mismatch (Similarity: 34.1%)",
    "Context risk: High urgency financial transfer demand"
  ],
  "recommended_action": "HOLD & INDEPENDENTLY VERIFY"
}
```

#### 3. Policy & Security Alert Event (Engine &rarr; Client)
```json
{
  "event": "ALERT_CREATED",
  "analysis_id": "018e47b3-82a1-7690-a192-800fc49e3bf1",
  "alert_level": "HIGH",
  "security_message": "NIRBHAYA SANCHAR SECURITY ALERT: High-risk synthetic speech detected. Hold transaction and verify independently.",
  "recommended_action": "HOLD & INDEPENDENTLY VERIFY"
}
```

---

### C. System 2 &rarr; System 1 HTTP Callback

- **Endpoint:** `POST ${SYSTEM1_CALLBACK_URL}` (e.g. `http://localhost:3001/api/nirbhaya/callback`)
- **Headers:**
  - `Content-Type: application/json`
  - `X-Nirbhaya-Engine-Key: <SYSTEM1_API_KEY>`
- **Payload:**
```json
{
  "event": "RISK_UPDATED",
  "call_id": "018e47b3-82a1-7690-a192-800fc49e3bf1",
  "analysis_id": "018e47b3-82a1-7690-a192-800fc49e3bf1",
  "risk_score": 78.4,
  "risk_level": "HIGH",
  "synthetic_probability": 82.5,
  "speaker_similarity": 34.1,
  "model_confidence": 0.94,
  "audio_quality": 0.96,
  "context_score": 70.0,
  "transaction_score": 85.0,
  "behavior_score": 40.0,
  "reasons": [
    "Elevated synthetic-speech signal (82.5% estimated synthetic probability)",
    "Speaker identity mismatch (Similarity: 34.1%)",
    "High-value transaction request: INR 250,000.00"
  ],
  "recommended_action": "HOLD",
  "policy_decision": "HOLD",
  "verification_required": true,
  "timestamp": "2026-08-27T19:20:05.120Z"
}
```

---

## 4. System 1 Protection Verification

- [x] No modifications to System 1 call signaling or authentication database.
- [x] No changes to existing LiveKit room connection parameters.
- [x] Smallest possible integration point: client-side audio tap in `CallScreen.jsx` + lightweight optional callback route in `connect/server/server.js`.
- [x] Full fallback resilience: If System 2 is offline or unreachable, System 1 continues call operations without interruption.
