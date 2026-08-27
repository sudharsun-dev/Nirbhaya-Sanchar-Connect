# NIRBHAYA SANCHAR ENGINE (SYSTEM 2)
### AI-POWERED VOICE IMPERSONATION SECURITY & FRAUD PREVENTION PLATFORM

Nirbhaya Sanchar Engine (System 2) is a real-time AI risk calculation, anti-spoofing synthetic voice detection, speaker verification, context intelligence, and policy enforcement platform.

---

## Key Features

- **REAL Voice Anti-Spoofing Model**: PyTorch LFCC-ResNet neural classifier for estimated synthetic speech probability without fake/random scores.
- **Speaker Verification Engine**: ECAPA-TDNN acoustic feature embeddings & cosine similarity.
- **Context Intelligence Engine**: Real-time intent analysis for urgent financial directives, OTP/PIN requests, and secrecy keywords.
- **Transaction Risk Engine**: Evaluates action type, transfer amount limits, and beneficiary status.
- **Risk Intelligence Engine**: Calibrated 0-100 risk scoring with confidence-aware dynamic rescaling.
- **Bank Policy Adapter**: Formats transaction HOLD & step-up verification alerts.
- **Institutional Light Mode UI**: Dashboard, Mobile Call UI, Real-time Waveform Canvas, "Why This Score?" panel, Policies, Audit Logs, and System Health.

---

## Quickstart Setup

### Backend (Python FastAPI)
```bash
cd Engine
$env:PYTHONPATH="backend"
python -m pytest backend/tests/ -v
python -m uvicorn app.main:app --port 8000 --reload
```

### Frontend (React + Vite)
```bash
cd Engine/frontend
npm run dev
```
Access at `http://localhost:5174`.

---

## Documentation Index

- [Architecture Guide](docs/ARCHITECTURE.md)
- [OpenAPI Specification](docs/API.md)
- [AI Anti-Spoof Model Documentation](docs/MODEL.md)
- [Policy Engine Specification](docs/POLICY.md)
- [Data Privacy & Security Policy](docs/SECURITY.md)
- [System 1 Integration Protocol](docs/SYSTEM1-INTEGRATION.md)
- [API Keys & Environment Credentials](docs/API-KEYS.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
