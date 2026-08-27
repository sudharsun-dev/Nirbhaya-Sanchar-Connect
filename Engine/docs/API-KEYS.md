# API KEYS & CREDENTIALS SPECIFICATION

This document details every environment variable and credential used by **Nirbhaya Sanchar Engine (System 2)**.

---

## Required Credentials

| Variable | Purpose | Location | Default Value | Security Warning |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | SQL Database connection string for session metadata, risk scores, and audit logs. | `.env` | `sqlite+aiosqlite:///./nirbhaya_engine.db` | Do not expose production db passwords. |
| `SYSTEM1_CALLBACK_URL` | System 1 callback webhook endpoint for security alerts and risk updates. | `.env` | `http://localhost:3001/api/nirbhaya/callback` | Ensure HTTP headers validate internal key. |
| `JWT_SECRET` | Secret key used to sign internal service JWT tokens. | `.env` | `nirbhaya_secret_key_2026_safe` | Replace in production with 64-char entropy secret. |
| `INTERNAL_API_KEY` | Shared secret key for service-to-service authentication between System 1 & System 2. | `.env` | `nirbhaya_internal_api_key_2026` | Keep confidential. Never publish in client source. |

---

## Optional Credentials

| Variable | Purpose | How to Obtain | Fallback Behavior |
| :--- | :--- | :--- | :--- |
| `VOICE_DETECTION_API_KEY` | Key for external cloud voice anti-spoofing provider. | HuggingFace / Elevenlabs / Resemblyzer portal. | Uses local PyTorch LFCC-ResNet engine. |
| `ASR_API_KEY` | OpenAI Whisper or Deepgram ASR API key. | [platform.openai.com](https://platform.openai.com) or [deepgram.com](https://deepgram.com). | Reports `ASR_UNAVAILABLE` cleanly without error. |
| `REDIS_URL` | Connection URL for distributed WebSocket event channel. | Redis Enterprise / AWS ElastiCache. | Uses in-memory WebSocket manager. |
| `SMTP_USER` / `SMTP_PASSWORD` | Credentials for sending email security alerts. | Corporate SMTP gateway. | Email alerts skipped cleanly. |

---

> [!CAUTION]
> Never commit `.env` files containing actual production API keys or database credentials to version control.
