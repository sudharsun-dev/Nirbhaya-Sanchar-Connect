import io
import time
import json
import math
import wave
import struct
import pytest
import asyncio
import numpy as np
import websockets
import httpx

from app.services.audio.preprocessor import preprocessor
from app.services.voice_detection.authenticity import voice_authenticity_engine
from app.services.speaker.verifier import speaker_verifier
from app.services.risk.risk_engine import risk_engine
from app.services.policy.policy_engine import policy_engine

def generate_synthetic_like_audio(duration_sec=2.5, sample_rate=16000) -> bytes:
    """
    Generates real 16kHz PCM audio waveform simulating synthetic voice harmonic patterns.
    """
    total_samples = int(duration_sec * sample_rate)
    t = np.linspace(0, duration_sec, total_samples, endpoint=False)
    
    # Fundamental frequency + vocoder-like high harmonics
    f0 = 180.0
    waveform = (
        0.5 * np.sin(2 * np.pi * f0 * t) +
        0.3 * np.sin(2 * np.pi * 2 * f0 * t) +
        0.2 * np.sin(2 * np.pi * 3 * f0 * t) +
        0.15 * np.sin(2 * np.pi * 4000.0 * t) # High freq vocoder artifact
    )
    waveform = np.clip(waveform, -1.0, 1.0)
    int_samples = (waveform * 32767).astype(np.int16)

    # Encode to WAV buffer
    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2) # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(int_samples.tobytes())
    
    return wav_io.getvalue()

def test_preprocessing_and_voice_pipeline_directly():
    """
    Direct pipeline verification: Preprocessing -> VAD -> Voice Model -> Risk Engine.
    """
    audio_bytes = generate_synthetic_like_audio(2.5, 16000)
    assert len(audio_bytes) > 1000

    # 1. Preprocessing
    processed = preprocessor.process_audio_bytes(audio_bytes)
    assert processed["sample_rate"] == 16000
    assert processed["channels"] == 1
    assert processed["speech_detected"] is True
    assert processed["audio_quality_score"] > 0.5
    assert processed["tensor"].shape[1] > 10000

    # 2. Voice Authenticity Inference
    voice_res = voice_authenticity_engine.analyze_audio(processed)
    assert voice_res["status"] == "SUCCESS"
    assert voice_res["synthetic_probability"] is not None
    assert 0.0 <= voice_res["synthetic_probability"] <= 100.0
    assert voice_res["model_name"] == "AASIST"
    assert voice_res["weights_loaded"] is True

    # 3. Speaker Verification
    speaker_res = speaker_verifier.compare_speaker(processed, reference_embedding=None)
    assert speaker_res["identity_status"] == "UNKNOWN"

    # 4. Risk Engine
    risk_res = risk_engine.compute_risk(
        voice_result=voice_res,
        speaker_result=speaker_res,
        context_result=None,
        transaction_result=None,
        behavior_result=None
    )
    assert 0.0 <= risk_res["risk_score"] <= 100.0
    assert risk_res["risk_level"] in ["LOW", "MEDIUM", "HIGH"]
    assert len(risk_res["reasons"]) > 0

    # 5. Policy Engine
    policy_res = policy_engine.evaluate(risk_output=risk_res, profile_name="BANK")
    assert policy_res["recommended_action"] in ["CONTINUE", "VERIFY", "HOLD", "ESCALATE"]

@pytest.mark.asyncio
async def test_websocket_real_audio_streaming_and_callback():
    """
    End-to-end WebSocket integration test:
    Connects to ws://localhost:8000/ws/analysis/{call_id}, streams real audio bytes,
    and asserts real risk events and callback trigger.
    """
    call_id = f"test_call_{int(time.time())}"
    ws_url = f"ws://127.0.0.1:8000/ws/analysis/{call_id}"
    audio_bytes = generate_synthetic_like_audio(2.5, 16000)

    async with websockets.connect(ws_url) as ws:
        # Receive initial ANALYSIS_STARTED
        init_msg = json.loads(await ws.recv())
        assert init_msg["event"] == "ANALYSIS_STARTED"
        assert init_msg["analysis_id"] == call_id

        # Send binary audio chunk
        await ws.send(audio_bytes)

        # Collect event responses
        events_received = {}
        for _ in range(3): # Expect AUDIO_PROCESSED, RISK_UPDATED, POLICY_UPDATED
            try:
                raw_event = await asyncio.wait_for(ws.recv(), timeout=5.0)
                event_data = json.loads(raw_event)
                events_received[event_data["event"]] = event_data
            except asyncio.TimeoutError:
                break

        assert "AUDIO_PROCESSED" in events_received, f"AUDIO_PROCESSED missing from {events_received.keys()}"
        assert events_received["AUDIO_PROCESSED"]["speech_detected"] is True

        assert "RISK_UPDATED" in events_received, f"RISK_UPDATED missing from {events_received.keys()}"
        risk_event = events_received["RISK_UPDATED"]
        assert 0.0 <= risk_event["risk_score"] <= 100.0
        assert risk_event["risk_level"] in ["LOW", "MEDIUM", "HIGH"]
        assert risk_event["synthetic_probability"] is not None
        assert len(risk_event["reasons"]) > 0

        assert "POLICY_UPDATED" in events_received, f"POLICY_UPDATED missing from {events_received.keys()}"

@pytest.mark.asyncio
async def test_system1_callback_endpoint_direct():
    """
    Verifies that System 1 server (port 3001) receives and registers callback risk payloads.
    """
    callback_url = "http://127.0.0.1:3001/api/nirbhaya/callback"
    payload = {
        "event": "RISK_UPDATED",
        "call_id": "test-call-audit-1",
        "analysis_id": "test-call-audit-1",
        "risk_score": 82.5,
        "risk_level": "HIGH",
        "synthetic_probability": 84.0,
        "speaker_similarity": 32.0,
        "reasons": ["Elevated synthetic voice signal detected"],
        "recommended_action": "HOLD & INDEPENDENTLY VERIFY"
    }
    headers = {
        "Content-Type": "application/json",
        "X-Nirbhaya-Engine-Key": "nirbhaya_system1_api_key_2026"
    }

    async with httpx.AsyncClient(timeout=3.0) as client:
        resp = await client.post(callback_url, json=payload, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["call_id"] == "test-call-audit-1"
