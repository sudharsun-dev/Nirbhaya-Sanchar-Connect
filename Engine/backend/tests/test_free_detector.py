import pytest
import io
import wave
import math
import numpy as np

from app.services.voice_detection.free_detector import FreeVoiceAuthenticityDetector, free_detector

def generate_test_audio(duration_sec=2.5, sample_rate=16000, is_synthetic=False) -> bytes:
    total_samples = int(duration_sec * sample_rate)
    t = np.linspace(0, duration_sec, total_samples, endpoint=False)
    
    if is_synthetic:
        # High-frequency vocoder artifact simulation (unnatural harmonics above 6kHz + high flux)
        f0 = 220.0
        waveform = (
            0.4 * np.sin(2 * np.pi * f0 * t) +
            0.3 * np.sin(2 * np.pi * 6500 * t) +
            0.2 * np.sin(2 * np.pi * 7200 * t) +
            0.1 * np.random.normal(0, 0.2, total_samples)
        )
    else:
        # Natural human speech-like harmonic structure (falling harmonics, low HF noise)
        f0 = 160.0
        waveform = (
            0.6 * np.sin(2 * np.pi * f0 * t) +
            0.3 * np.sin(2 * np.pi * 2 * f0 * t) +
            0.15 * np.sin(2 * np.pi * 3 * f0 * t) +
            0.05 * np.sin(2 * np.pi * 4 * f0 * t)
        )
        # Apply glottal pulse envelope
        envelope = 0.5 * (1 + np.sin(2 * np.pi * 4 * t))
        waveform = waveform * envelope

    waveform = np.clip(waveform, -1.0, 1.0)
    int_samples = (waveform * 32767).astype(np.int16)

    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(int_samples.tobytes())
    return wav_io.getvalue()

def test_free_detector_initialization():
    detector = FreeVoiceAuthenticityDetector()
    assert detector.is_configured is True
    assert detector.is_ready is True
    health = detector.get_health_status()
    assert health["status"] == "ONLINE"
    assert health["details"]["mode"] == "LOCAL_CPU_INFERENCE"

@pytest.mark.asyncio
async def test_free_detector_human_like_audio():
    detector = FreeVoiceAuthenticityDetector()
    audio = generate_test_audio(2.5, 16000, is_synthetic=False)
    
    result = await detector.send_audio_chunk("call_human_test", audio, window_index=1)
    assert result["available"] is True
    assert result["status"] == "ACTIVE"
    assert result["synthetic_probability"] is not None
    assert 0.0 <= result["synthetic_probability"] <= 100.0
    assert 0.0 <= result["authenticity_score"] <= 100.0
    assert abs(result["synthetic_probability"] + result["authenticity_score"] - 100.0) < 0.1
    assert result["confidence"] >= 0.80
    assert result["verdict"] in ["AUTHENTIC", "UNCERTAIN", "SYNTHETIC"]
    assert result["provider"] == detector.provider_name
    assert "inference_time_ms" in result

@pytest.mark.asyncio
async def test_free_detector_synthetic_artifact_audio():
    detector = FreeVoiceAuthenticityDetector()
    audio = generate_test_audio(2.5, 16000, is_synthetic=True)
    
    result = await detector.send_audio_chunk("call_synth_test", audio, window_index=1)
    assert result["available"] is True
    assert result["status"] == "ACTIVE"
    assert result["synthetic_probability"] is not None
    # Synthetic with high-frequency vocoder artifacts should have elevated synthetic probability
    assert result["synthetic_probability"] > 40.0
    assert result["label"] in ["FAKE", "SUSPICIOUS"]

@pytest.mark.asyncio
async def test_free_detector_silence():
    detector = FreeVoiceAuthenticityDetector()
    # 2.5s of near-silent PCM audio
    silence = np.zeros(40000, dtype=np.int16).tobytes()
    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(silence)
    
    result = await detector.send_audio_chunk("call_silence_test", wav_io.getvalue(), window_index=1)
    assert result["status"] == "NO_VOICE"
    assert result["synthetic_probability"] is None
    assert result["authenticity_score"] is None
    assert result["verdict"] == "NO_VOICE"

@pytest.mark.asyncio
async def test_free_detector_stream_lifecycle():
    detector = FreeVoiceAuthenticityDetector()
    audio = generate_test_audio(2.5, 16000, is_synthetic=False)
    
    call_id = "lifecycle_test_123"
    res1 = await detector.send_audio_chunk(call_id, audio, window_index=1)
    assert res1["status"] == "ACTIVE"
    
    res2 = await detector.send_audio_chunk(call_id, audio, window_index=2)
    assert res2["status"] == "ACTIVE"
    
    final_res = await detector.close_stream(call_id)
    assert final_res is not None
    assert call_id not in detector.active_sessions
