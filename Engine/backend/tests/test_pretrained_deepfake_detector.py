import os
import io
import glob
import wave
import pytest
import numpy as np
import soundfile as sf

from app.services.voice_detection.pretrained_deepfake_detector import (
    PretrainedDeepfakeDetector, pretrained_detector
)

def create_wav_bytes(duration=4.0, sr=16000, channels=1, is_noise=False, freq=200.0) -> bytes:
    total_samples = int(duration * sr)
    t = np.linspace(0, duration, total_samples, endpoint=False)
    
    if is_noise:
        waveform = np.random.normal(0, 0.2, (total_samples, channels)).astype(np.float32)
    else:
        sig = 0.5 * np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 2 * freq * t)
        if channels > 1:
            waveform = np.column_stack([sig] * channels).astype(np.float32)
        else:
            waveform = sig.astype(np.float32)

    waveform = np.clip(waveform, -1.0, 1.0)
    int_samples = (waveform * 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(int_samples.tobytes())
    return buf.getvalue()

def test_pretrained_detector_disabled_mode_health():
    """Verifies that in production (<512MB RAM) disabled mode, status is cleanly DISABLED without memory overhead."""
    detector = PretrainedDeepfakeDetector()
    detector.enabled = False
    detector.is_ready = False
    health = detector.get_health_status()
    assert health["status"] == "DISABLED"
    assert health["details"]["enabled"] is False
    assert health["details"]["status"] == "DISABLED"

def test_pretrained_detector_initialization():
    """Initializes detector for local offline evaluation."""
    detector = pretrained_detector
    detector.enabled = True
    initialized = detector.initialize()
    if initialized:
        assert detector.is_ready is True
        health = detector.get_health_status()
        assert health["status"] == "ONLINE"
        assert health["details"]["model"] == "Sara1708/deepfake-audio-wav2vec2"
    else:
        health = detector.get_health_status()
        assert health["status"] in ["DISABLED", "ERROR"]

def test_cloned_voice_detection_uploaded_sample():
    """
    TEST A: Run genuine pretrained Wav2Vec2 deepfake inference on the uploaded cloned voice file.
    Verifies properties and prints the required diagnostic summary.
    """
    detector = pretrained_detector
    detector.enabled = True
    detector.initialize()
    
    test_audio_dir = os.path.join(os.path.dirname(__file__), "../test_audio")
    whatsapp_files = glob.glob(os.path.join(test_audio_dir, "WhatsApp*"))
    if not whatsapp_files:
        whatsapp_files = [f for f in glob.glob(os.path.join(test_audio_dir, "*")) if not f.endswith("human_recording.wav")]
    
    assert len(whatsapp_files) > 0, "No uploaded cloned audio file found in test_audio/"
    file_path = whatsapp_files[0]
    filename = os.path.basename(file_path)
    
    info = sf.info(file_path)
    sample_rate = info.samplerate
    channels = info.channels
    duration = f"{info.duration:.2f}s"
    frames = info.frames
    subtype = info.subtype
    
    result = detector.predict_file(file_path)
    
    model_name = result.get("model", detector.model_repo)
    model_loaded = detector.is_ready
    synth_prob = result.get("synthetic_probability")
    authenticity = result.get("authenticity")
    confidence = result.get("confidence")
    verdict = result.get("verdict")
    label = result.get("label")
    
    print("\n========================================")
    print("CLONED VOICE DETECTION TEST")
    print("========================================")
    print(f"FILE={filename}")
    print(f"SAMPLE_RATE={sample_rate} Hz")
    print(f"CHANNELS={channels} ({'Mono' if channels == 1 else 'Stereo'})")
    print(f"DURATION={duration}")
    print(f"FRAMES={frames}")
    print(f"SUBTYPE={subtype}")
    print()
    print(f"MODEL={model_name}")
    print(f"MODEL_LOADED={model_loaded}")
    print()
    print(f"SYNTHETIC_PROBABILITY={synth_prob}")
    print(f"AUTHENTICITY={authenticity}")
    print(f"CONFIDENCE={confidence}")
    print(f"VERDICT={verdict}")
    print("========================================\n")
    
    if verdict == "AUTHENTIC" or label == "REAL":
        print("MODEL_RESULT=REAL")
        print("WARNING=PRETRAINED_MODEL_DID_NOT_DETECT_THIS_SAMPLE")
    
    assert 0.0 <= synth_prob <= 1.0
    assert 0.0 <= authenticity <= 1.0
    assert verdict in ["AUTHENTIC", "UNCERTAIN", "SYNTHETIC"]

def test_human_voice_detection_sample():
    """
    TEST B: Run genuine pretrained inference on normal human audio recording.
    """
    detector = pretrained_detector
    detector.enabled = True
    detector.initialize()
    
    human_file = os.path.join(os.path.dirname(__file__), "../test_audio/human_recording.wav")
    assert os.path.exists(human_file), f"File not found: {human_file}"
    
    info = sf.info(human_file)
    result = detector.predict_file(human_file)
    
    print("\n========================================")
    print("HUMAN VOICE DETECTION TEST")
    print("========================================")
    print(f"FILE={os.path.basename(human_file)}")
    print(f"SAMPLE_RATE={info.samplerate} Hz")
    print(f"CHANNELS={info.channels}")
    print(f"DURATION={info.duration:.2f}s")
    print()
    print(f"MODEL={result.get('model')}")
    print(f"MODEL_LOADED={detector.is_ready}")
    print()
    print(f"SYNTHETIC_PROBABILITY={result.get('synthetic_probability')}")
    print(f"AUTHENTICITY={result.get('authenticity')}")
    print(f"CONFIDENCE={result.get('confidence')}")
    print(f"VERDICT={result.get('verdict')}")
    print("========================================\n")
    
    assert 0.0 <= result["synthetic_probability"] <= 1.0

def test_pretrained_detector_silence():
    detector = pretrained_detector
    silence = np.zeros(64000, dtype=np.int16).tobytes()
    result = detector.predict_window(silence)
    assert result["status"] == "NO_VOICE"
    assert result["synthetic_probability"] is None
    assert result["authenticity"] is None

def test_pretrained_detector_short_audio():
    detector = pretrained_detector
    short_audio = create_wav_bytes(duration=0.5, sr=16000)
    result = detector.predict_audio(short_audio)
    assert result["synthetic_probability"] is not None

def test_pretrained_detector_noisy_audio():
    detector = pretrained_detector
    noisy_audio = create_wav_bytes(duration=4.0, sr=16000, is_noise=True)
    result = detector.predict_audio(noisy_audio)
    assert result["synthetic_probability"] is not None
    assert 0.0 <= result["synthetic_probability"] <= 1.0

def test_pretrained_detector_stereo_conversion():
    detector = pretrained_detector
    stereo_audio = create_wav_bytes(duration=4.0, sr=16000, channels=2)
    result = detector.predict_audio(stereo_audio)
    assert result["synthetic_probability"] is not None

def test_pretrained_detector_different_lengths():
    detector = pretrained_detector
    for duration in [2.0, 4.0, 7.5]:
        audio_bytes = create_wav_bytes(duration=duration, sr=16000)
        result = detector.predict_audio(audio_bytes)
        assert result["synthetic_probability"] is not None
        assert 0.0 <= result["synthetic_probability"] <= 1.0

@pytest.mark.asyncio
async def test_pretrained_detector_stream_aggregation_and_lifecycle():
    detector = pretrained_detector
    call_id = "test_stream_call_888"
    audio_chunk = create_wav_bytes(duration=2.5, sr=16000)
    
    r1 = await detector.send_audio_chunk(call_id, audio_chunk, window_index=1)
    assert r1["status"] == "ACTIVE"
    assert "synthetic_probability" in r1
    
    r2 = await detector.send_audio_chunk(call_id, audio_chunk, window_index=2)
    assert r2["status"] == "ACTIVE"
    
    final_res = await detector.close_stream(call_id)
    assert final_res is not None
