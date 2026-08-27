import pytest
import torch
from app.services.voice_detection.authenticity import voice_authenticity_engine

def test_voice_authenticity_inference():
    # Simulate preprocessed audio dict
    sample_tensor = torch.randn(1, 32000) # 2 seconds at 16kHz
    processed_audio = {
        "tensor": sample_tensor,
        "sample_rate": 16000,
        "channels": 1,
        "duration_ms": 2000.0,
        "speech_detected": True,
        "audio_quality_score": 0.90
    }

    result = voice_authenticity_engine.analyze_audio(processed_audio)

    assert result is not None
    assert result["status"] == "SUCCESS"
    assert result["synthetic_probability"] is not None
    assert 0.0 <= result["synthetic_probability"] <= 100.0
    assert result["authenticity_score"] == round(100.0 - result["synthetic_probability"], 2)
    assert result["model_name"] == "AASIST"
    assert result["weights_loaded"] is True
    assert result["inference_time_ms"] >= 0.0

def test_voice_authenticity_insufficient_audio():
    short_tensor = torch.randn(1, 500) # ~30ms audio
    processed_audio = {
        "tensor": short_tensor,
        "sample_rate": 16000,
        "channels": 1,
        "duration_ms": 30.0,
        "speech_detected": False,
        "audio_quality_score": 0.50
    }
    result = voice_authenticity_engine.analyze_audio(processed_audio)

    assert result["status"] == "INSUFFICIENT_AUDIO"
    assert result["synthetic_probability"] is None
