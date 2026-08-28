import os
import time
import math
import hashlib
import numpy as np

import torch.nn.functional as F
from app.config import settings
from app.services.voice_detection.aasist_model import Model as AASISTModel

DEFAULT_AASIST_CONFIG = {
    "architecture": "AASIST",
    "nb_samp": 64600,
    "first_conv": 128,
    "filts": [70, [1, 32], [32, 32], [32, 64], [64, 64]],
    "gat_dims": [64, 32],
    "pool_ratios": [0.5, 0.7, 0.5, 0.5],
    "temperatures": [2.0, 2.0, 100.0, 100.0]
}

class VoiceAuthenticityEngine:
    """
    Voice Authenticity and Synthetic Speech Anti-Spoofing Engine
    powered by the official NAVER Clova AI AASIST (Spectro-Temporal Graph Attention) model.
    Official Reference: https://github.com/clovaai/aasist
    """
    def __init__(self):
        self.model_name = settings.VOICE_MODEL_NAME
        self.model_provider = settings.VOICE_MODEL_PROVIDER
        self.model_version = settings.VOICE_MODEL_VERSION
        self.model_source = "https://github.com/clovaai/aasist"
        self.model_license = settings.VOICE_MODEL_LICENSE
        self.sample_rate = 16000
        self.input_format = "16kHz Mono Float32 Audio Tensor (padded to 64,600 samples)"
        self.max_len = 64600

        self.model = None
        self.is_loaded = False
        self.weights_loaded = False
        self.weights_path = None
        self.weights_sha256 = None
        self.total_parameters = 0
        self.load_error = None

        self._load_aasist_checkpoint()

    def _resolve_model_path(self) -> str:
        candidates = [
            settings.VOICE_MODEL_PATH,
            os.path.join(os.path.dirname(__file__), "../../../models/AASIST.pth"),
            "Engine/backend/models/AASIST.pth",
            "backend/models/AASIST.pth",
            "models/AASIST.pth"
        ]
        for path in candidates:
            if path and os.path.exists(path) and os.path.getsize(path) > 500000:
                return os.path.abspath(path)
        return None

    def _load_aasist_checkpoint(self):
        resolved_path = self._resolve_model_path()
        if not resolved_path:
            self.is_loaded = False
            self.weights_loaded = False
            self.load_error = "AASIST.pth checkpoint file not found. Pretrained weights are required for AI voice security analysis."
            print(f"[AASIST ERROR] {self.load_error}")
            return

        try:
            self.weights_path = resolved_path
            with open(resolved_path, "rb") as f:
                self.weights_sha256 = hashlib.sha256(f.read()).hexdigest()

            self.model = AASISTModel(DEFAULT_AASIST_CONFIG)
            state_dict = torch.load(resolved_path, map_location="cpu", weights_only=False)

            missing_keys, unexpected_keys = self.model.load_state_dict(state_dict, strict=True)
            if missing_keys or unexpected_keys:
                self.is_loaded = False
                self.weights_loaded = False
                self.load_error = f"Checkpoint key mismatch! Missing: {missing_keys}, Unexpected: {unexpected_keys}"
                print(f"[AASIST ERROR] {self.load_error}")
                return

            self.model.eval()
            self.total_parameters = sum(p.numel() for p in self.model.parameters())
            self.is_loaded = True
            self.weights_loaded = True
            print(f"[AASIST SUCCESS] Official pretrained AASIST model loaded from {resolved_path} (SHA256: {self.weights_sha256[:16]}..., Params: {self.total_parameters:,})")

        except Exception as e:
            self.is_loaded = False
            self.weights_loaded = False
            self.load_error = f"Failed to initialize AASIST model: {str(e)}"
            print(f"[AASIST ERROR] {self.load_error}")

    def _pad_audio_tensor(self, tensor: torch.Tensor) -> torch.Tensor:
        """
        Pads or repeats the 1D/2D audio tensor to 64,600 samples (~4.04s) as required by official AASIST.
        """
        if tensor.dim() == 2:
            tensor = tensor.squeeze(0)
        num_samples = tensor.shape[0]
        if num_samples >= self.max_len:
            return tensor[:self.max_len].unsqueeze(0)
        num_repeats = int(math.ceil(self.max_len / max(1, num_samples)))
        padded = tensor.repeat(num_repeats)[:self.max_len]
        return padded.unsqueeze(0)

    def analyze_audio(self, processed_audio: dict) -> dict:
        """
        Analyzes audio tensor for synthetic voice / voice impersonation markers using official AASIST inference.
        """
        start_time = time.time()

        if not self.is_loaded or not self.weights_loaded or self.model is None:
            return {
                "status": "MODEL_UNAVAILABLE",
                "synthetic_probability": None,
                "authenticity_score": None,
                "confidence": 0.0,
                "audio_quality": processed_audio.get("audio_quality_score", 1.0),
                "model_name": self.model_name,
                "model_provider": self.model_provider,
                "model_version": self.model_version,
                "model_source": self.model_source,
                "model_license": self.model_license,
                "weights_loaded": False,
                "inference_time_ms": 0.0,
                "status_detail": self.load_error or "AASIST model weights offline."
            }

        tensor = processed_audio.get("tensor")
        speech_detected = processed_audio.get("speech_detected", True)

        if tensor is None or not speech_detected or tensor.shape[-1] < 1600:
            return {
                "status": "INSUFFICIENT_AUDIO",
                "synthetic_probability": None,
                "authenticity_score": None,
                "confidence": 0.0,
                "audio_quality": processed_audio.get("audio_quality_score", 1.0),
                "model_name": self.model_name,
                "model_provider": self.model_provider,
                "model_version": self.model_version,
                "model_source": self.model_source,
                "model_license": self.model_license,
                "weights_loaded": True,
                "inference_time_ms": round((time.time() - start_time) * 1000, 2),
                "status_detail": "No clear speech detected in audio window."
            }

        try:
            # 1. Pad/Repeat audio to 64,600 samples for AASIST graph input
            input_tensor = self._pad_audio_tensor(tensor)

            # 2. AASIST forward pass
            with torch.no_grad():
                _, output = self.model(input_tensor)
                probs = F.softmax(output, dim=-1)

            # 3. Extract official ASVspoof class probabilities:
            # Index 0: Spoof / Synthetic Speech
            # Index 1: Bonafide / Authentic Human Speech
            spoof_prob = float(probs[0, 0].item())
            bonafide_prob = float(probs[0, 1].item())

            synthetic_probability = round(spoof_prob * 100.0, 2)
            authenticity_score = round(bonafide_prob * 100.0, 2)

            audio_quality = float(processed_audio.get("audio_quality_score", 1.0))
            margin = abs(spoof_prob - bonafide_prob)
            confidence = round(max(0.50, min(0.99, (margin * 0.5 + 0.5) * audio_quality)), 2)

            inference_time_ms = round((time.time() - start_time) * 1000, 2)

            return {
                "status": "SUCCESS",
                "synthetic_probability": synthetic_probability,
                "authenticity_score": authenticity_score,
                "spoof_logit": round(float(output[0, 0].item()), 4),
                "bonafide_logit": round(float(output[0, 1].item()), 4),
                "confidence": confidence,
                "audio_quality": audio_quality,
                "model_name": self.model_name,
                "model_provider": self.model_provider,
                "model_version": self.model_version,
                "model_source": self.model_source,
                "model_license": self.model_license,
                "weights_loaded": True,
                "inference_time_ms": inference_time_ms,
                "status_detail": None
            }

        except Exception as e:
            return {
                "status": "ERROR",
                "synthetic_probability": None,
                "authenticity_score": None,
                "confidence": 0.0,
                "audio_quality": processed_audio.get("audio_quality_score", 1.0),
                "model_name": self.model_name,
                "model_provider": self.model_provider,
                "model_version": self.model_version,
                "model_source": self.model_source,
                "model_license": self.model_license,
                "weights_loaded": self.weights_loaded,
                "inference_time_ms": round((time.time() - start_time) * 1000, 2),
                "status_detail": f"AASIST inference error: {str(e)}"
            }

voice_authenticity_engine = VoiceAuthenticityEngine()
