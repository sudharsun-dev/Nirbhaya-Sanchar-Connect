# ARCHITECTURE DOCUMENTATION — NIRBHAYA SANCHAR ENGINE (SYSTEM 2)

## Overview
**Nirbhaya Sanchar Engine (System 2)** is an authoritative AI risk calculation, synthetic voice anti-spoofing, speaker verification, and policy engine. It operates completely decoupled from **Nirbhaya Sanchar Connect (System 1)**.

---

## Technical Pipeline

```
                                [ SYSTEM 1: Nirbhaya Sanchar Connect ]
                                                   │
                                     (REST API / WebSocket Audio Stream)
                                                   │
                                                   ▼
                                   [ SYSTEM 2: Nirbhaya Sanchar Engine ]
                                                   │
                                          ┌────────┴────────┐
                                          │  Audio Buffer   │
                                          └────────┬────────┘
                                                   │
                                                   ▼
                                       ┌───────────────────────┐
                                       │  AudioPreprocessor    │ (VAD, Normalization, Quality)
                                       └───────────┬───────────┘
                                                   │
            ┌──────────────────────┬───────────────┼───────────────┬──────────────────────┐
            ▼                      ▼               ▼               ▼                      ▼
 ┌─────────────────────┐ ┌──────────────────┐ ┌───────────┐ ┌─────────────┐ ┌───────────────────────────┐
 │  VoiceAuthenticity  │ │ SpeakerVerifier  │ │ Real ASR  │ │ Transaction │ │   Behavioral Signals      │
 │     (Anti-Spoof)    │ │ (Similarity/MFCC)│ │ (Text)    │ │   Engine    │ │ (Speech rate, pause, etc) │
 └──────────┬──────────┘ └────────┬─────────┘ └─────┬─────┘ └──────┬──────┘ └─────────────┬─────────────┘
            │                     │                 │              │                      │
            │                     │                 ▼              │                      │
            │                     │      ┌────────────────────┐    │                      │
            │                     │      │ ContextIntelligence│    │                      │
            │                     │      └──────────┬─────────┘    │                      │
            └─────────────────────┼─────────────────┴──────────────┴──────────────────────┘
                                  │
                                  ▼
                        ┌───────────────────┐
                        │   Risk Engine     │ (0-100 Score, Low/Med/High, Confidence-weighted)
                        └─────────┬─────────┘
                                  │
                        ┌─────────┴─────────┐
                        ▼                   ▼
             ┌─────────────────────┐ ┌──────────────┐
             │ Explanation Engine  │ │Policy Engine │ (Bank Policy Adapter: Hold & Verify)
             └─────────────────────┘ └──────┬───────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │ System1Callback │ ──► Notify System 1 UI Security Alert
                                   └─────────────────┘
```

---

## Core Engine Modules

1. **AudioPreprocessor** (`app/services/audio/preprocessor.py`):
   - Resamples audio to 16,000 Hz mono PCM float32.
   - Normalizes peak & RMS amplitude.
   - Performs energy-based Voice Activity Detection (VAD).
   - Measures audio quality score (SNR and clipping penalties).

2. **VoiceAuthenticityEngine** (`app/services/voice_detection/authenticity.py`):
   - Real anti-spoofing engine utilizing Linear Frequency Cepstral Coefficients (LFCC) and neural classifier.
   - Evaluates high-frequency spectral flux anomalies, phase inconsistency, and vocoder pitch perturbation.

3. **SpeakerVerificationEngine** (`app/services/speaker/verifier.py`):
   - Computes acoustic speaker embeddings (MFCC Delta-Delta spectral representation).
   - Calculates cosine similarity against target reference voice profiles (`MATCHED`, `MISMATCH`, `UNKNOWN`).

4. **Speech-To-Text / ASR Engine** (`app/services/asr/asr_engine.py`):
   - Multi-language ASR transcriber (English, Hindi, Tamil, etc.).

5. **ContextIntelligenceEngine** (`app/services/context/context_engine.py`):
   - Analyzes spoken text for high-risk social engineering directives, urgency pressure, OTP/PIN requests, and secrecy isolation keywords.

6. **TransactionRiskEngine** (`app/services/transaction/transaction_engine.py`):
   - Evaluates financial action type (`TRANSFER`, `NEW_BENEFICIARY`, `PASSWORD_RESET`, `OTP_REQUEST`, `CREDENTIAL_REQUEST`), amount, sensitivity, and policy limits.

7. **RiskEngine** (`app/services/risk/risk_engine.py`):
   - Confidence-weighted signal aggregation into 0-100 score and risk level (`LOW`, `MEDIUM`, `HIGH`).
   - Dynamic weight rescaling ensures unavailable models do not produce fake numbers.

8. **PolicyEngine & BankPolicyAdapter** (`app/services/policy/policy_engine.py`):
   - Maps risk scores to organizational actions (`CONTINUE`, `VERIFY`, `HOLD`, `ESCALATE`).
   - Generates System 1 security alert cards.
