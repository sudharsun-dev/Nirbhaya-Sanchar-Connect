# OPENAPI ENDPOINT SPECIFICATION — NIRBHAYA SANCHAR ENGINE (SYSTEM 2)

Base URL: `http://localhost:8000/api/v1`

---

## 1. System Health

### `GET /api/v1/health`
Returns real empirical health check status for database, Voice AI, Speaker Verifier, ASR Engine, and System 1 connection.

**Response `200 OK`**:
```json
{
  "app": "NIRBHAYA_SANCHAR_ENGINE",
  "environment": "development",
  "status": "ONLINE",
  "services": {
    "database": { "status": "ONLINE", "message": "ONLINE" },
    "voice_ai": {
      "status": "ONLINE",
      "details": {
        "model_name": "nirbhaya-antispoof-v1",
        "provider": "PyTorch AntiSpoof LFCC-ResNet Engine",
        "version": "1.0.0",
        "license": "Apache 2.0 / Open Weights"
      }
    },
    "speaker_verifier": { "status": "ONLINE", "details": { "model": "ECAPA-TDNN / Acoustic Spectral Vector" } },
    "asr_engine": { "status": "CONFIGURATION_REQUIRED", "details": { "provider": "Nirbhaya MultiLang ASR / Whisper API", "model": "whisper-base-multilingual" } },
    "system1_connect": { "status": "OFFLINE", "details": { "url": "http://localhost:3001" } }
  },
  "timestamp": "2026-08-27T18:30:00.000Z"
}
```

---

## 2. Analysis Lifecycle

### `POST /api/v1/analysis/start`
Initializes a new real-time voice analysis session.

**Request Body**:
```json
{
  "call_id": "call_9812401",
  "caller_id": "+919876543210",
  "receiver_id": "+919123456789",
  "channel": "VOIP",
  "transaction": {
    "type": "TRANSFER",
    "amount": 500000,
    "currency": "INR",
    "sensitivity": "HIGH"
  }
}
```

**Response `200 OK`**:
```json
{
  "analysis_id": "9f8a7b6c-1234-5678-9abc-def012345678",
  "status": "STARTED",
  "timestamp": "2026-08-27T18:30:05.000Z"
}
```

---

### `POST /api/v1/analysis/{analysis_id}/audio`
Processes an audio window chunk (multipart/form-data with `file`, `window_index`, `transcript_override`).

**Response `200 OK`**:
```json
{
  "analysis_id": "9f8a7b6c-1234-5678-9abc-def012345678",
  "window_index": 1,
  "duration_ms": 2000.0,
  "speech_detected": true,
  "audio_quality_score": 0.95,
  "risk_score": 84.5,
  "risk_level": "HIGH",
  "recommended_action": "HOLD",
  "reasons": [
    "Elevated synthetic-speech signal (84.5% estimated synthetic probability)",
    "High-value transaction request: INR 500,000.00",
    "High urgency and pressure language detected"
  ],
  "timestamp": "2026-08-27T18:30:07.000Z"
}
```

---

### `GET /api/v1/analysis/{analysis_id}/risk`
Retrieves latest calculated risk score for an analysis session.

---

### `GET /api/v1/analysis/{analysis_id}/explanation`
Retrieves prominent "WHY THIS SCORE?" evidence breakdown.

---

## 3. WebSockets

### `WS /ws/analysis/{analysis_id}`
Real-time WebSocket audio streaming input & event broadcasting (`ANALYSIS_STARTED`, `AUDIO_RECEIVED`, `AUDIO_PROCESSED`, `RISK_UPDATED`, `POLICY_UPDATED`, `ALERT_CREATED`).
