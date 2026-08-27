# Nirbhaya Sanchar (System 2) — Environment Setup & Configuration Guide

This document details every environment variable used in System 2 (`Engine/`), its purpose, requirement level, source, and associated service.

---

| VARIABLE | PURPOSE | REQUIRED / OPTIONAL | WHERE TO OBTAIN IT | USED BY |
| :--- | :--- | :--- | :--- | :--- |
| `APP_NAME` | Name identifier for the Engine service instance | Optional (Default: `NIRBHAYA_SANCHAR_ENGINE`) | Configurable locally | FastAPI Server, Logging |
| `ENVIRONMENT` | Execution runtime environment (`development`, `staging`, `production`) | Optional (Default: `development`) | Set by deployment environment | FastAPI, Health Check |
| `API_HOST` | Network interface address to bind the API server | Optional (Default: `0.0.0.0`) | Configurable locally | Uvicorn / FastAPI |
| `API_PORT` | Port for the backend REST and WebSocket server | Optional (Default: `8000`) | Configurable locally | Uvicorn / FastAPI |
| `DATABASE_URL` | SQLAlchemy async connection string for call metadata, windows, and audit logs | Required (Default: `sqlite+aiosqlite:///./nirbhaya_engine.db` or PostgreSQL) | Local SQLite file or Cloud PostgreSQL connection URI | Database Engine (`app.database`) |
| `REDIS_URL` | Connection URL for distributed WebSocket caching and rate limiting | Optional | Redis instance (e.g. `redis://localhost:6379/0`) | Caching / Task Queue |
| `SYSTEM1_BASE_URL` | Base URL of System 1 (Connect VoIP) server | Required (Default: `http://localhost:3001`) | System 1 configuration (`connect/server/server.js`) | Health check, Service Discovery |
| `SYSTEM1_CALLBACK_URL`| HTTP POST callback endpoint in System 1 for security updates | Required (Default: `http://localhost:3001/api/nirbhaya/callback`) | System 1 callback route | Callback Service (`callback_service.py`) |
| `SYSTEM1_API_KEY` | Shared secret header (`X-Nirbhaya-Engine-Key`) to authenticate callbacks | Optional in dev, Required in prod | Generated shared secret string | Callback Service, Request Signing |
| `LIVEKIT_URL` | WebSocket URL for LiveKit Cloud or self-hosted SFU | Optional (Only needed if Engine runs a server-side LiveKit subscriber bot) | LiveKit Cloud Dashboard (`https://cloud.livekit.io`) | LiveKit Server Subscriber |
| `LIVEKIT_API_KEY` | API Key for LiveKit server token generation | Optional (Only needed for server-side LiveKit bot) | LiveKit Cloud Dashboard | LiveKit Server Subscriber |
| `LIVEKIT_API_SECRET` | API Secret for LiveKit server token generation | Optional (Only needed for server-side LiveKit bot) | LiveKit Cloud Dashboard | LiveKit Server Subscriber |
| `VOICE_MODEL_PROVIDER`| Human-readable description of voice anti-spoofing engine | Optional | Configured in code / settings | Health API, Audit Logs |
| `VOICE_MODEL_NAME` | Model identifier for deepfake voice detection | Optional (Default: `nirbhaya-antispoof-v1`) | Open-weights / Custom trained model identifier | Voice Authenticity Engine |
| `VOICE_MODEL_VERSION` | Version of the voice authenticity neural weights | Optional (Default: `1.0.0`) | Model release version | Voice Authenticity Engine |
| `VOICE_MODEL_PATH` | File path to local `.pt` / `.onnx` model weights | Optional (Uses bundled neural architecture by default) | Local filesystem path | Voice Authenticity Engine |
| `SPEAKER_MODEL` | Speaker embedding extractor architecture | Optional (Default: `ECAPA-TDNN / Acoustic Spectral Vector`) | Model specification | Speaker Verifier |
| `ASR_PROVIDER` | Speech recognition engine provider description | Optional | Settings | ASR Engine |
| `ASR_MODEL` | ASR model architecture (e.g. `whisper-base-multilingual`) | Optional | Settings | ASR Engine |
| `ASR_API_KEY` | Bearer token / API key for external Whisper / ASR API | Optional (Gracefully falls back to local or reports ASR_UNAVAILABLE) | OpenAI / Groq / Local Whisper API endpoint | ASR Engine (`asr_engine.py`) |
| `ASR_API_URL` | REST endpoint for speech-to-text inference | Optional | Cloud / Local Whisper Server (e.g. `https://api.openai.com/v1/audio/transcriptions`) | ASR Engine (`asr_engine.py`) |
| `GEMINI_API_KEY` | Google Gemini API Key for advanced multimodal / context threat analysis | Optional | Google AI Studio (`https://aistudio.google.com/`) | Context Threat Engine |
| `JWT_SECRET` | Secret key for signing analyst portal JWT tokens | Required in prod | Secure 256-bit random string | Auth Service |
| `INTERNAL_API_KEY` | Engine internal service-to-service authentication key | Required | Secure random key | API Router & Callbacks |
| `STORAGE_PROVIDER` | Ephemeral audio storage mechanism (`local`, `memory`, `s3`) | Optional (Default: `local`) | Settings | Temporary Buffer Manager |
| `STORAGE_BUCKET` | Ephemeral buffer bucket / directory name | Optional (Default: `nirbhaya_audio_temp`) | Settings | Temporary Buffer Manager |

---

## Security Guidelines

1. **Never commit `.env` to Git**: Always verify `.env` is listed in `.gitignore`.
2. **No Real Secrets in Source Code**: Use environment variables for all secrets, credentials, and API keys.
3. **Graceful Degradation**: When optional AI API keys (such as `ASR_API_KEY` or `GEMINI_API_KEY`) are not present, System 2 automatically reports clear `STATUS: CONFIGURATION_REQUIRED` or `STATUS: ASR_UNAVAILABLE` rather than generating mock or synthetic outputs.
