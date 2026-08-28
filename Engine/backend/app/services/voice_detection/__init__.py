from app.services.voice_detection.free_detector import free_detector, FreeVoiceAuthenticityDetector
from app.services.voice_detection.resemble_detector import resemble_detector, ResembleStreamingDetector

# Active default detector for Nirbhaya Sanchar Voice Authenticity Engine
voice_detector = free_detector

__all__ = [
    "voice_detector",
    "free_detector",
    "FreeVoiceAuthenticityDetector",
    "resemble_detector",
    "ResembleStreamingDetector"
]
