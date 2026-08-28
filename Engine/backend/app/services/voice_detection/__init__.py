import os
from app.services.voice_detection.free_detector import free_detector, FreeVoiceAuthenticityDetector
from app.services.voice_detection.resemble_detector import resemble_detector, ResembleStreamingDetector
from app.services.voice_detection.pretrained_deepfake_detector import pretrained_detector, PretrainedDeepfakeDetector

# Check if pretrained detector is explicitly enabled via environment variable
pretrained_enabled = os.getenv("PRETRAINED_DETECTOR_ENABLED", "false").lower() in ("true", "1", "yes")

if pretrained_enabled and pretrained_detector.is_ready:
    voice_detector = pretrained_detector
else:
    voice_detector = free_detector

__all__ = [
    "voice_detector",
    "free_detector",
    "FreeVoiceAuthenticityDetector",
    "pretrained_detector",
    "PretrainedDeepfakeDetector",
    "resemble_detector",
    "ResembleStreamingDetector"
]
