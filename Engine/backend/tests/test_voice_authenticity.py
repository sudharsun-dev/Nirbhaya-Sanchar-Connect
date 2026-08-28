import pytest
from app.services.voice_detection.resemble_detector import ResembleStreamingDetector

def test_resemble_detector_initialization():
    detector = ResembleStreamingDetector()
    assert detector is not None
    assert hasattr(detector, "active_sessions")
    assert hasattr(detector, "send_audio_chunk")

