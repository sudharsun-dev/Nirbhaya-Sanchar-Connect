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
from unittest.mock import AsyncMock, patch

from app.services.audio.preprocessor import preprocessor
from app.services.speaker.verifier import speaker_verifier
from app.services.risk.risk_engine import risk_engine
from app.services.policy.policy_engine import policy_engine

def generate_synthetic_like_audio(duration_sec=2.5, sample_rate=16000) -> bytes:
    """
    Generates real 16kHz PCM audio waveform.
    """
    total_samples = int(duration_sec * sample_rate)
    t = np.linspace(0, duration_sec, total_samples, endpoint=False)
    
    f0 = 180.0
    waveform = (
        0.5 * np.sin(2 * np.pi * f0 * t) +
        0.3 * np.sin(2 * np.pi * 2 * f0 * t) +
        0.2 * np.sin(2 * np.pi * 3 * f0 * t)
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
    Direct pipeline verification: Preprocessing -> VAD -> Risk Engine.
    """
    audio_bytes = generate_synthetic_like_audio(2.5, 16000)
    assert len(audio_bytes) > 1000

    # 1. Preprocessing (Pure NumPy)
    processed = preprocessor.process_audio_bytes(audio_bytes)
    assert processed["sample_rate"] == 16000
    assert processed["channels"] == 1
    assert processed["speech_detected"] is True
    assert processed["audio_quality_score"] > 0.5

    # 2. Resemble Voice Mock Result
    voice_res = {
        "available": True,
        "status": "ACTIVE",
        "label": "REAL",
        "synthetic_probability": 15.0,
        "authenticity_score": 85.0,
        "confidence": 0.95
    }

    # 3. Speaker Verification (Pure NumPy)
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

from starlette.testclient import TestClient
from app.main import app
from app.services.system1.callback_service import callback_service

def test_websocket_real_audio_streaming_in_process():
    """
    End-to-end WebSocket integration test with in-process TestClient:
    Connects to /ws/analysis/{call_id}, streams real 16kHz audio binary bytes,
    and asserts real risk events: AUDIO_PROCESSED, RISK_UPDATED, POLICY_UPDATED.
    """
    client = TestClient(app)
    call_id = f"test_call_{int(time.time())}"
    audio_bytes = generate_synthetic_like_audio(2.5, 16000)

    with client.websocket_connect(f"/ws/analysis/{call_id}") as ws:
        # Receive initial ANALYSIS_STARTED
        init_msg = ws.receive_json()
        assert init_msg["event"] == "ANALYSIS_STARTED"
        assert init_msg["analysis_id"] == call_id

        # Send binary audio chunk
        ws.send_bytes(audio_bytes)

        # Collect event responses
        events_received = {}
        for _ in range(3): # Expect AUDIO_PROCESSED, RISK_UPDATED, POLICY_UPDATED
            try:
                event_data = ws.receive_json()
                events_received[event_data["event"]] = event_data
            except Exception:
                break

        assert "AUDIO_PROCESSED" in events_received, f"AUDIO_PROCESSED missing from {events_received.keys()}"
        assert events_received["AUDIO_PROCESSED"]["speech_detected"] is True

        assert "RISK_UPDATED" in events_received, f"RISK_UPDATED missing from {events_received.keys()}"
        risk_event = events_received["RISK_UPDATED"]
        assert risk_event["detector"] in ["RESEMBLE", "LOCAL_VOICE_AI"]
        assert "risk_level" in risk_event

        assert "POLICY_UPDATED" in events_received, f"POLICY_UPDATED missing from {events_received.keys()}"

@pytest.mark.asyncio
async def test_callback_service_resilience():
    """
    Verifies that callback service safely handles network failures without raising exceptions.
    """
    res = await callback_service.send_callback(
        event="RISK_UPDATED",
        call_id="test-resilience-1",
        analysis_id="test-resilience-1",
        risk_output={"risk_score": 85.0, "risk_level": "HIGH", "reasons": ["Synthetic speech detected"]},
        policy_output={"recommended_action": "HOLD & INDEPENDENTLY VERIFY", "reasons": []},
        verification_required=True
    )
    assert res is not None
    assert "status" in res

