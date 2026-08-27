# DATA PRIVACY & SECURITY POLICY

## 1. Raw Audio Short-Term Purge Policy

```
[ RAW AUDIO CHUNK ] ──► [ SHORT-TERM MEMORY BUFFER ] ──► [ FEATURE EXTRACTION ] ──► [ PURGE RAW AUDIO ]
                                                                │
                                                                ▼
                                                    [ SAVE METADATA & RISK ]
```

1. **Short-Term In-Memory Processing**: Incoming audio stream chunks are buffered in short-term RAM only.
2. **Feature Extraction**: Acoustic features (LFCC, spectral flux, MFCC vectors) are extracted in memory.
3. **Immediate Raw Audio Purge**: Raw audio bytes are deleted immediately after feature extraction. Raw audio is NEVER saved to permanent disk storage by default.
4. **No Secret Logging**: Passwords, PINs, OTPs, API keys, JWT tokens, and raw speech audio are strictly excluded from structured application logs.
5. **Protected Speaker Embeddings**: Speaker verification uses protected mathematical feature embeddings (80-dimensional Acoustic Spectral Vectors), not raw audio recordings.
