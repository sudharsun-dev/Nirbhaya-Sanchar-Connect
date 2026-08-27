import pytest
import numpy as np
import soundfile as sf
import io
from app.services.audio.preprocessor import preprocessor

def generate_sample_wav_bytes(duration_sec=1.0, sr=16000, freq=440.0):
    t = np.linspace(0, duration_sec, int(sr * duration_sec), False)
    audio = 0.5 * np.sin(2 * np.pi * freq * t)
    buf = io.BytesIO()
    sf.write(buf, audio.astype(np.float32), sr, format='WAV')
    return buf.getvalue()

def test_audio_preprocessing_valid_wav():
    wav_bytes = generate_sample_wav_bytes(duration_sec=2.0)
    result = preprocessor.process_audio_bytes(wav_bytes)

    assert result is not None
    assert result["sample_rate"] == 16000
    assert result["channels"] == 1
    assert result["duration_ms"] > 1800.0
    assert result["speech_detected"] is True
    assert 0.0 <= result["audio_quality_score"] <= 1.0

def test_audio_preprocessing_silence():
    silence = np.zeros(16000, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, silence, 16000, format='WAV')
    result = preprocessor.process_audio_bytes(buf.getvalue())

    assert result["speech_detected"] is False
