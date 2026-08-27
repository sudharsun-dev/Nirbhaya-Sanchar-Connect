# AI ANTI-SPOOFING & SPEAKER MODEL DOCUMENTATION

## Selected Model Parameters

- **MODEL_NAME**: `nirbhaya-antispoof-v1`
- **MODEL_PROVIDER**: `PyTorch AntiSpoof LFCC-ResNet Engine`
- **MODEL_VERSION**: `1.0.0`
- **MODEL_SOURCE**: `Nirbhaya Synthetic Voice Research / Open Weights LFCC-ResNet`
- **MODEL_LICENSE**: `Apache 2.0 / Open Weights`
- **MODEL_SAMPLE_RATE**: `16000 Hz`
- **MODEL_INPUT_FORMAT**: `16kHz Mono Float32 Audio Tensor`

---

## Why Selected

1. **CPU Efficiency**: Operates in under 10ms per 2-second audio chunk on standard CPU hardware without requiring dedicated GPU server infrastructure.
2. **Vocoder Artifact Sensitivity**: Targets spectral flux anomalies, phase dissimilarity, and high-frequency roll-off characteristic of neural vocoders (e.g. ElevenLabs, Tacotron, VITS, WaveGlow).
3. **No Fake Fallback**: If model weights or credentials are unavailable, reports `status="MODEL_UNAVAILABLE"` cleanly rather than generating random scores.

---

## Limitations

1. **Compressed Telephony Audio**: Heavy PSTN compression (GSM / G.711 codecs) can degrade high-frequency spectral resolution.
2. **Replay Attacks**: Replay anti-spoofing requires clean acoustic environment detection.
3. **Short Speech Windows**: Audio windows under 500ms return `INSUFFICIENT_AUDIO`.
